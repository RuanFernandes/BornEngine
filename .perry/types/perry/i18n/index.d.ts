// Type declarations for perry/i18n — Perry's internationalization module
// These types are auto-written by `perry init` / `perry types` so IDEs
// and tsc can resolve `import { ... } from "perry/i18n"`.

/** Translate a key using the project's locale table. */
export function t(key: string, params?: Record<string, any>): string;

/** Format a number as locale-appropriate currency. */
export function Currency(value: number): string;

/** Format a decimal as a locale-appropriate percentage. */
export function Percent(value: number): string;

/** Format a timestamp as a short date (e.g. "4/13/2026"). */
export function ShortDate(value: number): string;

/** Format a timestamp as a long date (e.g. "April 13, 2026"). */
export function LongDate(value: number): string;

/** Format a number with locale-appropriate grouping and decimals. */
export function FormatNumber(value: number): string;

/** Format a timestamp as a locale-appropriate time string. */
export function FormatTime(value: number): string;

/** Pass a value through without locale formatting. */
export function Raw(value: any): string;
