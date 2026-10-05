fn container_pairs(commands: &[UiCommand]) -> HashMap<usize, usize> {
    let mut stack: Vec<(usize, UiOpcode)> = Vec::new();
    let mut pairs = HashMap::new();
    for (index, command) in commands.iter().enumerate() {
        if let Some(end) = matching_end_opcode(command.opcode) {
            stack.push((index, end));
        } else if let Some((start, expected)) = stack.last().copied() {
            if expected == command.opcode {
                stack.pop();
                pairs.insert(start, index);
            }
        }
    }
    pairs
}

fn matching_end_opcode(opcode: UiOpcode) -> Option<UiOpcode> {
    Some(match opcode {
        UiOpcode::BeginWindow => UiOpcode::EndWindow,
        UiOpcode::BeginPanel => UiOpcode::EndPanel,
        UiOpcode::BeginHorizontal => UiOpcode::EndHorizontal,
        UiOpcode::BeginVertical => UiOpcode::EndVertical,
        UiOpcode::BeginScrollArea => UiOpcode::EndScrollArea,
        UiOpcode::BeginTabBar => UiOpcode::EndTabBar,
        UiOpcode::BeginTabItem => UiOpcode::EndTabItem,
        UiOpcode::Combo => UiOpcode::EndCombo,
        UiOpcode::BeginMenuBar => UiOpcode::EndMenuBar,
        UiOpcode::BeginMenu => UiOpcode::EndMenu,
        UiOpcode::BeginTable => UiOpcode::EndTable,
        UiOpcode::CollapsingHeader => UiOpcode::EndCollapsingHeader,
        UiOpcode::TreeNode => UiOpcode::TreePop,
        _ => return None,
    })
}

fn pointer_button(button: u8) -> Option<PointerButton> {
    match button {
        0 => Some(PointerButton::Primary),
        1 => Some(PointerButton::Secondary),
        2 => Some(PointerButton::Middle),
        3 => Some(PointerButton::Extra1),
        4 => Some(PointerButton::Extra2),
        _ => None,
    }
}

fn widget_response<R>(ui: &mut Ui, id: u32, add: impl FnOnce(&mut Ui) -> R) -> R {
    ui.push_id(("bornengine-ui-widget", id), add).inner
}

fn gui_values(command: &GuiCommand) -> &[f64] {
    let Some((count_index, values_start)) = gui_values_range(command) else {
        return &[];
    };
    let count = finite_usize(command.scratch[count_index])
        .unwrap_or(0)
        .min(command.scratch.len() - values_start);
    &command.scratch[values_start..values_start + count]
}

const GUI_FOCUS_SENTINEL: f64 = -1_247_107_654.0;

fn gui_focus_request(values: &[f64]) -> Option<f64> {
    if values.len() >= 2 && values[values.len() - 2] == GUI_FOCUS_SENTINEL {
        Some(values[values.len() - 1])
    } else {
        None
    }
}

fn gui_ancestor_stretch_scale(id: u32, commands: &[GuiCommand]) -> Vec2 {
    let mut scale = Vec2::splat(1.0);
    let mut has_x_scale = false;
    let mut has_y_scale = false;
    let mut current_id = id;
    let mut visited = HashSet::new();
    while current_id != 0 && visited.insert(current_id) {
        let Some(command) = commands.iter().find(|command| command.id == current_id) else {
            break;
        };
        let parent_id = gui_parent_id(command);
        if parent_id == 0 {
            break;
        }
        let Some(parent) = commands.iter().find(|command| command.id == parent_id) else {
            break;
        };
        if finite_usize(parent.scratch.first().copied().unwrap_or(-1.0)) == Some(5) {
            let values = gui_values(parent);
            let virtual_width = finite_f32(values.first().copied().unwrap_or(0.0)).unwrap_or(0.0);
            let virtual_height = finite_f32(values.get(1).copied().unwrap_or(0.0)).unwrap_or(0.0);
            let width = finite_f32(parent.args[2]).unwrap_or(0.0);
            let height = finite_f32(parent.args[3]).unwrap_or(0.0);
            if !has_x_scale && virtual_width > 0.0 {
                scale.x = width / virtual_width;
                has_x_scale = true;
            }
            if !has_y_scale && virtual_height > 0.0 {
                scale.y = height / virtual_height;
                has_y_scale = true;
            }
        }
        current_id = parent_id;
    }
    Vec2::new(scale.x.max(0.000_001), scale.y.max(0.000_001))
}

fn gui_values_range(command: &GuiCommand) -> Option<(usize, usize)> {
    if command.scratch.len() < 55 {
        return None;
    }
    let clip_count = finite_usize(command.scratch[53])?.min((command.scratch.len() - 54) / 5);
    let count_index = 54 + clip_count * 5;
    let values_start = count_index + 1;
    (values_start <= command.scratch.len()).then_some((count_index, values_start))
}

struct GuiFrameSetLayout<'a> {
    frame: Rect,
    padding: f32,
    splitter: f32,
    columns: usize,
    rows: usize,
    child_index: usize,
    column_weights: &'a [f32],
    row_weights: &'a [f32],
}

fn gui_frame_set_cell_bounds(layout: GuiFrameSetLayout<'_>) -> Option<Rect> {
    let GuiFrameSetLayout {
        frame,
        padding,
        splitter,
        columns,
        rows,
        child_index,
        column_weights,
        row_weights,
    } = layout;
    if columns == 0
        || rows == 0
        || child_index >= columns.saturating_mul(rows)
        || column_weights.len() != columns
        || row_weights.len() != rows
    {
        return None;
    }
    let column = child_index % columns;
    let row = child_index / columns;
    let content = frame.shrink(padding.max(0.0));
    let available_width =
        (content.width() - splitter.max(0.0) * columns.saturating_sub(1) as f32).max(0.0);
    let available_height =
        (content.height() - splitter.max(0.0) * rows.saturating_sub(1) as f32).max(0.0);
    let x = content.min.x
        + available_width * column_weights.iter().take(column).sum::<f32>()
        + splitter.max(0.0) * column as f32;
    let y = content.min.y
        + available_height * row_weights.iter().take(row).sum::<f32>()
        + splitter.max(0.0) * row as f32;
    let width = available_width * column_weights[column].max(0.0);
    let height = available_height * row_weights[row].max(0.0);
    Some(Rect::from_min_size(
        Pos2::new(x, y),
        Vec2::new(width, height),
    ))
}

fn gui_parent_id(command: &GuiCommand) -> u32 {
    command
        .scratch
        .get(52)
        .and_then(|value| finite_usize(*value))
        .and_then(|value| u32::try_from(value).ok())
        .unwrap_or(0)
}

fn gui_ancestor_scroll_offset(
    mut parent_id: u32,
    parent_ids: &HashMap<u32, u32>,
    scroll_offsets: &HashMap<u32, [f32; 2]>,
) -> Vec2 {
    let mut offset = Vec2::ZERO;
    let mut visited = HashSet::new();
    while parent_id != 0 && visited.insert(parent_id) {
        if let Some(scroll) = scroll_offsets.get(&parent_id) {
            offset += Vec2::new(scroll[0], scroll[1]);
        }
        parent_id = parent_ids.get(&parent_id).copied().unwrap_or(0);
    }
    offset
}

fn gui_control_clip(
    command: &GuiCommand,
    viewport: Rect,
    parent_ids: &HashMap<u32, u32>,
    scroll_offsets: &HashMap<u32, [f32; 2]>,
) -> Rect {
    let Some(clip_count) = command
        .scratch
        .get(53)
        .and_then(|count| finite_usize(*count))
    else {
        return viewport;
    };
    let available = command.scratch.len().saturating_sub(54) / 5;
    let clip_count = clip_count.min(available);
    if clip_count > 0 {
        let mut clip = viewport;
        for index in 0..clip_count {
            let base = 54 + index * 5;
            let owner_id = finite_usize(command.scratch[base])
                .and_then(|id| u32::try_from(id).ok())
                .unwrap_or(0);
            let Some(x) = finite_f32(command.scratch[base + 1]) else {
                continue;
            };
            let Some(y) = finite_f32(command.scratch[base + 2]) else {
                continue;
            };
            let Some(width) = finite_f32(command.scratch[base + 3]) else {
                continue;
            };
            let Some(height) = finite_f32(command.scratch[base + 4]) else {
                continue;
            };
            let owner_parent = parent_ids.get(&owner_id).copied().unwrap_or(0);
            let offset = gui_ancestor_scroll_offset(owner_parent, parent_ids, scroll_offsets);
            let clip_bounds = Rect::from_min_size(
                Pos2::new(x - offset.x, y - offset.y),
                Vec2::new(width.max(0.0), height.max(0.0)),
            );
            clip = clip.intersect(clip_bounds);
        }
        return clip;
    }

    if command.scratch.get(1).copied().unwrap_or(0.0) > 0.5 {
        let x = finite_f32(command.scratch.get(2).copied().unwrap_or(0.0)).unwrap_or(0.0);
        let y = finite_f32(command.scratch.get(3).copied().unwrap_or(0.0)).unwrap_or(0.0);
        let width = finite_f32(command.scratch.get(4).copied().unwrap_or(0.0))
            .unwrap_or(0.0)
            .max(0.0);
        let height = finite_f32(command.scratch.get(5).copied().unwrap_or(0.0))
            .unwrap_or(0.0)
            .max(0.0);
        return viewport.intersect(Rect::from_min_size(
            Pos2::new(x, y),
            Vec2::new(width, height),
        ));
    }
    viewport
}

fn gui_scroll_content_sizes(
    commands: &[GuiCommand],
    parent_ids: &HashMap<u32, u32>,
) -> HashMap<u32, Vec2> {
    let mut content_sizes = HashMap::new();
    for scroll in commands.iter().filter(|command| {
        command.opcode == GuiOpcode::Control
            && command.scratch.first().and_then(|kind| finite_usize(*kind)) == Some(3)
    }) {
        let Some(x) = finite_f32(scroll.args[0]) else {
            continue;
        };
        let Some(y) = finite_f32(scroll.args[1]) else {
            continue;
        };
        let Some(width) = finite_f32(scroll.args[2]) else {
            continue;
        };
        let Some(height) = finite_f32(scroll.args[3]) else {
            continue;
        };
        let mut content = Vec2::new(width.max(0.0), height.max(0.0));
        for child in commands
            .iter()
            .filter(|command| command.opcode == GuiOpcode::Control)
        {
            if child.id == scroll.id || !gui_is_descendant_of(child.id, scroll.id, parent_ids) {
                continue;
            }
            let Some(right) = finite_f32(child.args[0])
                .zip(finite_f32(child.args[2]))
                .map(|(left, child_width)| left + child_width.max(0.0))
            else {
                continue;
            };
            let Some(bottom) = finite_f32(child.args[1])
                .zip(finite_f32(child.args[3]))
                .map(|(top, child_height)| top + child_height.max(0.0))
            else {
                continue;
            };
            content.x = content.x.max(right - x);
            content.y = content.y.max(bottom - y);
        }
        content_sizes.insert(scroll.id, content);
    }
    content_sizes
}

fn gui_is_descendant_of(
    mut child_id: u32,
    ancestor_id: u32,
    parent_ids: &HashMap<u32, u32>,
) -> bool {
    let mut visited = HashSet::new();
    while child_id != 0 && visited.insert(child_id) {
        child_id = parent_ids.get(&child_id).copied().unwrap_or(0);
        if child_id == ancestor_id {
            return true;
        }
    }
    false
}

fn gui_profile_color(values: &[f64], offset: usize) -> Color32 {
    if values.len() < offset + 4 {
        return Color32::WHITE;
    }
    let channels = &values[offset..offset + 4];
    let scale = if channels.iter().all(|channel| (0.0..=1.0).contains(channel)) {
        255.0
    } else {
        1.0
    };
    color_from_f64(
        channels[0] * scale,
        channels[1] * scale,
        channels[2] * scale,
        channels[3] * scale,
    )
}

fn gui_opacity(values: &[f64]) -> f32 {
    finite_f32(values.get(40).copied().unwrap_or(1.0))
        .unwrap_or(1.0)
        .clamp(0.0, 1.0)
}

fn paint_gui_texture(
    painter: &egui::Painter,
    handle: u64,
    bounds: Rect,
    tint: Color32,
    rotation_degrees: f32,
    zoom: f32,
) {
    if bounds.width() <= 0.0 || bounds.height() <= 0.0 {
        return;
    }
    let size = bounds.size() * zoom.clamp(0.01, 1024.0);
    let center = bounds.center();
    let half = size * 0.5;
    let angle = rotation_degrees.to_radians();
    let (sin, cos) = angle.sin_cos();
    let corners = [
        (Vec2::new(-half.x, -half.y), Pos2::new(0.0, 0.0)),
        (Vec2::new(half.x, -half.y), Pos2::new(1.0, 0.0)),
        (Vec2::new(half.x, half.y), Pos2::new(1.0, 1.0)),
        (Vec2::new(-half.x, half.y), Pos2::new(0.0, 1.0)),
    ];
    let mut mesh = egui::Mesh::with_texture(egui::TextureId::User(handle));
    for (offset, uv) in corners {
        let rotated = Vec2::new(
            offset.x * cos - offset.y * sin,
            offset.x * sin + offset.y * cos,
        );
        mesh.vertices.push(egui::epaint::Vertex {
            pos: center + rotated,
            uv,
            color: tint,
        });
    }
    mesh.indices.extend_from_slice(&[0, 1, 2, 0, 2, 3]);
    painter.add(Shape::mesh(mesh));
}

fn paint_gui_texture_tiled(
    painter: &egui::Painter,
    handle: u64,
    bounds: Rect,
    tint: Color32,
    tile_size: Vec2,
) {
    if bounds.width() <= 0.0 || bounds.height() <= 0.0 || tile_size.x <= 0.0 || tile_size.y <= 0.0 {
        paint_gui_texture(painter, handle, bounds, tint, 0.0, 1.0);
        return;
    }
    let mut mesh = egui::Mesh::with_texture(egui::TextureId::User(handle));
    let mut y = bounds.min.y;
    let mut tile_count = 0usize;
    while y < bounds.max.y && tile_count < 16_384 {
        let height = tile_size.y.min(bounds.max.y - y);
        let v = height / tile_size.y;
        let mut x = bounds.min.x;
        while x < bounds.max.x && tile_count < 16_384 {
            let width = tile_size.x.min(bounds.max.x - x);
            let u = width / tile_size.x;
            let base = mesh.vertices.len() as u32;
            let positions = [
                (Pos2::new(x, y), Pos2::new(0.0, 0.0)),
                (Pos2::new(x + width, y), Pos2::new(u, 0.0)),
                (Pos2::new(x + width, y + height), Pos2::new(u, v)),
                (Pos2::new(x, y + height), Pos2::new(0.0, v)),
            ];
            mesh.vertices
                .extend(positions.into_iter().map(|(pos, uv)| egui::epaint::Vertex {
                    pos,
                    uv,
                    color: tint,
                }));
            mesh.indices
                .extend_from_slice(&[base, base + 1, base + 2, base, base + 2, base + 3]);
            x += tile_size.x;
            tile_count += 1;
        }
        y += tile_size.y;
        tile_count += 1;
    }
    painter.add(Shape::mesh(mesh));
}

fn paint_gui_bitmap_border(
    painter: &egui::Painter,
    handle: u64,
    bounds: Rect,
    tint: Color32,
    border_width: f32,
    texture_size: Vec2,
    tiled: bool,
) {
    let thickness = border_width
        .max(0.0)
        .min(bounds.width() * 0.5)
        .min(bounds.height() * 0.5);
    if thickness <= 0.0 || bounds.width() <= 0.0 || bounds.height() <= 0.0 {
        return;
    }

    let middle_height = (bounds.height() - thickness * 2.0).max(0.0);
    let edges = [
        (
            Rect::from_min_size(bounds.min, Vec2::new(bounds.width(), thickness)),
            true,
        ),
        (
            Rect::from_min_size(
                Pos2::new(bounds.min.x, bounds.max.y - thickness),
                Vec2::new(bounds.width(), thickness),
            ),
            true,
        ),
        (
            Rect::from_min_size(
                Pos2::new(bounds.min.x, bounds.min.y + thickness),
                Vec2::new(thickness, middle_height),
            ),
            false,
        ),
        (
            Rect::from_min_size(
                Pos2::new(bounds.max.x - thickness, bounds.min.y + thickness),
                Vec2::new(thickness, middle_height),
            ),
            false,
        ),
    ];

    for (edge, horizontal) in edges {
        if edge.width() <= 0.0 || edge.height() <= 0.0 {
            continue;
        }
        if tiled && texture_size.x > 0.0 && texture_size.y > 0.0 {
            let tile_size = if horizontal {
                Vec2::new(texture_size.x, thickness)
            } else {
                Vec2::new(thickness, texture_size.y)
            };
            paint_gui_texture_tiled(painter, handle, edge, tint, tile_size);
        } else {
            paint_gui_texture(painter, handle, edge, tint, 0.0, 1.0);
        }
    }
}

fn paint_gui_drawing(
    ui: &Ui,
    viewport: Rect,
    owner_bounds: Rect,
    owner_clip: Rect,
    command: &GuiCommand,
) {
    if command.scratch.len() < 7 {
        return;
    }
    let width = finite_f32(command.scratch[0]).unwrap_or(0.0).max(0.0);
    let height = finite_f32(command.scratch[1]).unwrap_or(0.0).max(0.0);
    let panel = Rect::from_min_size(
        Pos2::new(command.args[2] as f32, command.args[3] as f32),
        Vec2::new(width, height),
    );
    let requested_clip = if command.scratch[2] > 0.5 {
        Rect::from_min_size(
            Pos2::new(command.scratch[3] as f32, command.scratch[4] as f32),
            Vec2::new(
                command.scratch[5].max(0.0) as f32,
                command.scratch[6].max(0.0) as f32,
            ),
        )
    } else {
        viewport
    };
    let painter = ui.painter_at(panel.intersect(viewport)).with_clip_rect(
        viewport
            .intersect(requested_clip)
            .intersect(owner_clip)
            .intersect(owner_bounds),
    );
    let values = &command.scratch[7..];
    let number = |index: usize| values.get(index).and_then(|value| finite_f32(*value));
    let color = |offset: usize| gui_profile_color(values, offset);
    match finite_usize(command.args[1]).unwrap_or(usize::MAX) {
        0 if values.len() >= 9 => {
            if let (Some(x1), Some(y1), Some(x2), Some(y2), Some(thickness)) =
                (number(0), number(1), number(2), number(3), number(8))
            {
                painter.line_segment(
                    [panel.min + Vec2::new(x1, y1), panel.min + Vec2::new(x2, y2)],
                    Stroke::new(thickness.max(0.1), color(4)),
                );
            }
        }
        1 if values.len() >= 9 => {
            if let (Some(x), Some(y), Some(w), Some(h)) =
                (number(0), number(1), number(2), number(3))
            {
                let rect = Rect::from_min_size(
                    panel.min + Vec2::new(x, y),
                    Vec2::new(w.max(0.0), h.max(0.0)),
                );
                if values[8] > 0.5 {
                    painter.rect_filled(rect, egui::CornerRadius::ZERO, color(4));
                } else {
                    painter.rect_stroke(
                        rect,
                        egui::CornerRadius::ZERO,
                        Stroke::new(1.0, color(4)),
                        egui::StrokeKind::Inside,
                    );
                }
            }
        }
        2 if values.len() >= 8 => {
            if let (Some(x), Some(y), Some(radius), Some(thickness)) =
                (number(0), number(1), number(2), number(7))
            {
                painter.circle_stroke(
                    panel.min + Vec2::new(x, y),
                    radius.max(0.0),
                    Stroke::new(thickness.max(0.1), color(3)),
                );
            }
        }
        3 if values.len() >= 7 => {
            if let (Some(x), Some(y), Some(size)) = (number(0), number(1), number(2)) {
                painter.text(
                    panel.min + Vec2::new(x, y),
                    Align2::LEFT_TOP,
                    command.text.as_str(),
                    egui::FontId::proportional(size.max(1.0)),
                    color(3),
                );
            }
        }
        4 if values.len() >= 10 => {
            if let (Some(handle), Some(x), Some(y), Some(width), Some(height), Some(rotation)) = (
                finite_u64(values[0]).filter(|handle| *handle != 0),
                number(1),
                number(2),
                number(3),
                number(4),
                number(9),
            ) {
                let tint = gui_profile_color(values, 5);
                let destination = Rect::from_min_size(
                    panel.min + Vec2::new(x, y),
                    Vec2::new(width.max(0.0), height.max(0.0)),
                );
                paint_gui_texture(&painter, handle, destination, tint, rotation, 1.0);
            }
        }
        5 | 6 if values.len() >= 8 => {
            let count = finite_usize(values[0])
                .unwrap_or(0)
                .min((values.len().saturating_sub(6)) / 2);
            let points: Vec<_> = (0..count)
                .filter_map(|index| {
                    Some(panel.min + Vec2::new(number(6 + index * 2)?, number(7 + index * 2)?))
                })
                .collect();
            if points.len() >= 2 {
                let stroke = Stroke::new(number(5).unwrap_or(1.0).max(0.1), color(1));
                if finite_usize(command.args[1]).unwrap_or(0) == 6 {
                    painter.add(Shape::convex_polygon(points, Color32::TRANSPARENT, stroke));
                } else {
                    painter.line(points, stroke);
                }
            }
        }
        _ => {}
    }
}

fn make_gui_event(
    event_type: GuiEventType,
    id: u32,
    pointer: Option<[f64; 2]>,
    bounds: Rect,
    modifiers: u32,
) -> GuiEventRecord {
    let mut event = GuiEventRecord::new(event_type, id);
    if let Some([x, y]) = pointer {
        event.global_x = x;
        event.global_y = y;
        event.local_x = x - bounds.min.x as f64;
        event.local_y = y - bounds.min.y as f64;
    }
    event.modifiers = modifiers as f64;
    event
}

fn make_gui_event_for_control(
    event_type: GuiEventType,
    id: u32,
    pointer: Option<[f64; 2]>,
    bounds: Rect,
    modifiers: u32,
    local_scale: Vec2,
) -> GuiEventRecord {
    let mut event = make_gui_event(event_type, id, pointer, bounds, modifiers);
    event.local_x /= local_scale.x as f64;
    event.local_y /= local_scale.y as f64;
    event
}

fn key_from_bloom(code: u32) -> Option<Key> {
    Some(match code {
        32 => Key::Space,
        8 => Key::Backspace,
        9 => Key::Tab,
        27 => Key::Escape,
        127 => Key::Delete,
        256 => Key::ArrowUp,
        257 => Key::ArrowDown,
        258 => Key::ArrowLeft,
        259 => Key::ArrowRight,
        260 => Key::Insert,
        261 => Key::Home,
        262 => Key::End,
        263 => Key::PageUp,
        264 => Key::PageDown,
        265 => Key::Enter,
        280 => Key::ShiftLeft,
        281 => Key::ShiftRight,
        282 => Key::ControlLeft,
        283 => Key::ControlRight,
        284 => Key::AltLeft,
        285 => Key::AltRight,
        286 => Key::SuperLeft,
        287 => Key::SuperRight,
        48..=57 => match code {
            48 => Key::Num0,
            49 => Key::Num1,
            50 => Key::Num2,
            51 => Key::Num3,
            52 => Key::Num4,
            53 => Key::Num5,
            54 => Key::Num6,
            55 => Key::Num7,
            56 => Key::Num8,
            _ => Key::Num9,
        },
        65..=90 => match code {
            65 => Key::A,
            66 => Key::B,
            67 => Key::C,
            68 => Key::D,
            69 => Key::E,
            70 => Key::F,
            71 => Key::G,
            72 => Key::H,
            73 => Key::I,
            74 => Key::J,
            75 => Key::K,
            76 => Key::L,
            77 => Key::M,
            78 => Key::N,
            79 => Key::O,
            80 => Key::P,
            81 => Key::Q,
            82 => Key::R,
            83 => Key::S,
            84 => Key::T,
            85 => Key::U,
            86 => Key::V,
            87 => Key::W,
            88 => Key::X,
            89 => Key::Y,
            _ => Key::Z,
        },
        112..=123 => match code {
            112 => Key::F1,
            113 => Key::F2,
            114 => Key::F3,
            115 => Key::F4,
            116 => Key::F5,
            117 => Key::F6,
            118 => Key::F7,
            119 => Key::F8,
            120 => Key::F9,
            121 => Key::F10,
            122 => Key::F11,
            _ => Key::F12,
        },
        _ => return None,
    })
}

fn to_egui_modifiers(modifiers: super::UiModifiers) -> Modifiers {
    Modifiers {
        alt: modifiers.alt,
        ctrl: modifiers.ctrl,
        shift: modifiers.shift,
        mac_cmd: modifiers.super_key,
        command: modifiers.super_key || modifiers.ctrl,
    }
}

fn finite_f32(value: f64) -> Option<f32> {
    if value.is_finite() && value.abs() <= f32::MAX as f64 {
        Some(value as f32)
    } else {
        None
    }
}

fn finite_f64(value: f64) -> Option<f64> {
    value.is_finite().then_some(value)
}
fn finite_u64(value: f64) -> Option<u64> {
    (value.is_finite() && value >= 0.0 && value.fract() == 0.0 && value <= u64::MAX as f64)
        .then_some(value as u64)
}
fn finite_usize(value: f64) -> Option<usize> {
    finite_u64(value).and_then(|value| usize::try_from(value).ok())
}
fn ordered_range(a: f64, b: f64) -> std::ops::RangeInclusive<f64> {
    a.min(b)..=a.max(b)
}
fn color_from_f64(r: f64, g: f64, b: f64, a: f64) -> Color32 {
    Color32::from_rgba_unmultiplied(
        color_channel(r),
        color_channel(g),
        color_channel(b),
        color_channel(a),
    )
}
