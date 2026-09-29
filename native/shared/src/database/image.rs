//! Validation of imported SQLite images against a declared schema.

use super::*;

pub(super) fn validate_database_image(bytes: &[u8]) -> Result<(Connection, i64), DatabaseStatus> {
    let mut connection = Connection::open_in_memory().map_err(|_| DatabaseStatus::StorageError)?;
    connection
        .deserialize_read_exact(MAIN_DB, bytes, bytes.len(), false)
        .map_err(|error| map_sql_error(&error, DatabaseStatus::CorruptData))?;
    if !integrity_check(&connection)
        .map_err(|error| map_sql_error(&error, DatabaseStatus::CorruptData))?
    {
        return Err(DatabaseStatus::CorruptData);
    }
    let version: i64 = connection
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .map_err(|error| map_sql_error(&error, DatabaseStatus::CorruptData))?;
    if version < 0 {
        return Err(DatabaseStatus::UnsupportedVersion);
    }
    Ok((connection, version))
}

pub(super) fn database_physical_schema_matches(
    imported: &Connection,
    current: &Connection,
) -> Result<bool, DatabaseStatus> {
    let imported_tables = read_physical_table_names(imported)?;
    let current_tables = read_physical_table_names(current)?;
    if imported_tables != current_tables {
        return Ok(false);
    }

    for table in imported_tables {
        let imported_sql = physical_table_sql(imported, &table)?;
        let current_sql = physical_table_sql(current, &table)?;
        if imported_sql != current_sql {
            return Ok(false);
        }

        let imported_indexes = physical_index_fingerprints(imported, &table)?;
        let current_indexes = physical_index_fingerprints(current, &table)?;
        // Migrations cannot describe partial-index predicates, so matching only
        // the indexed terms would not prove that both databases enforce the
        // same constraint.
        if imported_indexes.iter().any(|index| index.partial)
            || current_indexes.iter().any(|index| index.partial)
        {
            return Ok(false);
        }
        if imported_indexes != current_indexes {
            return Ok(false);
        }
    }
    Ok(true)
}

fn read_physical_table_names(connection: &Connection) -> Result<Vec<String>, DatabaseStatus> {
    connection
        .prepare(
            "SELECT name FROM sqlite_master \
             WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
        )
        .map_err(|_| DatabaseStatus::CorruptData)?
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|_| DatabaseStatus::CorruptData)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|_| DatabaseStatus::CorruptData)
}

fn physical_table_sql(connection: &Connection, table: &str) -> Result<String, DatabaseStatus> {
    connection
        .query_row(
            "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?1",
            [table],
            |row| row.get(0),
        )
        .map_err(|_| DatabaseStatus::CorruptData)
}

fn physical_index_fingerprints(
    connection: &Connection,
    table: &str,
) -> Result<Vec<PhysicalIndexFingerprint>, DatabaseStatus> {
    let mut statement = connection
        .prepare(&format!("PRAGMA index_list({})", quote_identifier(table)))
        .map_err(|_| DatabaseStatus::CorruptData)?;
    let mut rows = statement
        .query([])
        .map_err(|_| DatabaseStatus::CorruptData)?;
    let mut indexes = Vec::new();
    while let Some(row) = rows.next().map_err(|_| DatabaseStatus::CorruptData)? {
        let name: String = row.get(1).map_err(|_| DatabaseStatus::CorruptData)?;
        let unique: i64 = row.get(2).map_err(|_| DatabaseStatus::CorruptData)?;
        let origin: String = row.get(3).map_err(|_| DatabaseStatus::CorruptData)?;
        let partial: i64 = row.get(4).map_err(|_| DatabaseStatus::CorruptData)?;
        if origin == "pk" {
            continue;
        }

        let mut term_statement = connection
            .prepare(&format!("PRAGMA index_xinfo({})", quote_identifier(&name)))
            .map_err(|_| DatabaseStatus::CorruptData)?;
        let mut term_rows = term_statement
            .query([])
            .map_err(|_| DatabaseStatus::CorruptData)?;
        let mut terms = Vec::new();
        while let Some(term_row) = term_rows.next().map_err(|_| DatabaseStatus::CorruptData)? {
            let cid: i64 = term_row.get(1).map_err(|_| DatabaseStatus::CorruptData)?;
            let column: Option<String> =
                term_row.get(2).map_err(|_| DatabaseStatus::CorruptData)?;
            let descending: i64 = term_row.get(3).map_err(|_| DatabaseStatus::CorruptData)?;
            let collation: Option<String> =
                term_row.get(4).map_err(|_| DatabaseStatus::CorruptData)?;
            let is_key_term: i64 = term_row.get(5).map_err(|_| DatabaseStatus::CorruptData)?;
            if is_key_term == 0 {
                continue;
            }
            // Expression and rowid terms cannot be produced by the migration API.
            // Reject them instead of comparing an incomplete signature.
            if cid < 0 {
                return Err(DatabaseStatus::CorruptData);
            }
            let Some(column) = column else {
                return Err(DatabaseStatus::CorruptData);
            };
            let Some(collation) = collation else {
                return Err(DatabaseStatus::CorruptData);
            };
            terms.push(PhysicalIndexTerm {
                column,
                descending: descending != 0,
                collation,
            });
        }
        if terms.is_empty() {
            return Err(DatabaseStatus::CorruptData);
        }

        // SQLite's inline UNIQUE autoindexes have no migration-visible name.
        // Explicit indexes keep their exact names, including the engine's
        // reserved-looking prefix, because createIndex accepts that prefix.
        let public_name = (origin != "u").then_some(name);
        indexes.push(PhysicalIndexFingerprint {
            name: public_name,
            unique: unique != 0,
            partial: partial != 0,
            terms,
        });
    }
    indexes.sort();
    Ok(indexes)
}

#[derive(Clone, Debug, Eq, Ord, PartialEq, PartialOrd)]
struct PhysicalIndexFingerprint {
    name: Option<String>,
    unique: bool,
    partial: bool,
    terms: Vec<PhysicalIndexTerm>,
}

#[derive(Clone, Debug, Eq, Ord, PartialEq, PartialOrd)]
struct PhysicalIndexTerm {
    column: String,
    descending: bool,
    collation: String,
}

pub(super) fn database_schema_matches(
    connection: &Connection,
    expected: &DatabaseSchema,
) -> Result<bool, DatabaseStatus> {
    let mut physical_tables = {
        let mut statement = connection
            .prepare(
                "SELECT name FROM sqlite_master \
                 WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
            )
            .map_err(|_| DatabaseStatus::CorruptData)?;
        let tables = statement
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(|_| DatabaseStatus::CorruptData)?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(|_| DatabaseStatus::CorruptData)?;
        tables
    };
    let expected_tables: Vec<String> = expected.tables.keys().cloned().collect();
    physical_tables.sort();
    if physical_tables != expected_tables {
        return Ok(false);
    }
    let has_unsupported_objects: bool = connection
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM sqlite_master \
             WHERE type IN ('view', 'trigger') AND name NOT LIKE 'sqlite_%')",
            [],
            |row| row.get(0),
        )
        .map_err(|_| DatabaseStatus::CorruptData)?;
    if has_unsupported_objects {
        return Ok(false);
    }

    for (table, expected_table) in &expected.tables {
        let physical_columns =
            read_physical_columns(connection, table).map_err(|_| DatabaseStatus::CorruptData)?;
        if physical_columns.len() != expected_table.columns.len() {
            return Ok(false);
        }
        for (name, expected_column) in &expected_table.columns {
            let Some((_, physical_column)) = physical_columns
                .iter()
                .find(|(physical_name, _)| physical_name == name)
            else {
                return Ok(false);
            };
            if physical_column.kind != expected_column.kind
                || physical_column.primary_key != expected_column.primary_key
                || physical_column.auto_increment != expected_column.auto_increment
                || physical_column.not_null
                    != (expected_column.not_null || expected_column.primary_key)
            {
                return Ok(false);
            }
        }

        if expected_table.columns.values().any(|column| column.unique) {
            let indexes = read_physical_indexes(connection, table)
                .map_err(|_| DatabaseStatus::CorruptData)?;
            for (column_name, column) in &expected_table.columns {
                if column.unique
                    && !indexes.iter().any(|index| {
                        index.unique && index.columns.as_slice() == [column_name.as_str()]
                    })
                {
                    return Ok(false);
                }
            }
        }
    }
    Ok(true)
}
