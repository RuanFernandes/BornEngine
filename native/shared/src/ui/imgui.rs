use std::cell::RefCell;
use std::collections::HashMap;
use std::path::PathBuf;
use std::time::Duration;

use imgui::{Condition, FontConfig, FontId, FontSource, Key, MouseButton, Ui};

use super::{
    color_channel, UiBackend, UiCaptureState, UiCommand, UiInputEvent, UiInputSnapshot, UiOpcode,
    UiResponse,
};

const MAX_FONT_BYTES: usize = 1_048_576;

// Dear ImGui's context is !Send. Keep its mutable state thread-local so
// UiSystem only carries Send commands and readbacks into native engine locks.
thread_local! {
    static DEAR_IMGUI: RefCell<DearImGuiUi> = RefCell::new(DearImGuiUi::default());
}

pub(crate) fn with_dear_imgui<R>(f: impl FnOnce(&mut DearImGuiUi) -> R) -> R {
    DEAR_IMGUI.with(|state| f(&mut state.borrow_mut()))
}

pub struct DearImGuiUi {
    context: imgui::Context,
    responses: HashMap<u32, UiResponse>,
    capture: UiCaptureState,
    font_ids: HashMap<u32, FontId>,
    loaded_fonts: HashMap<u32, Vec<u8>>,
    demo_open: bool,
    metrics_open: bool,
}

impl Default for DearImGuiUi {
    fn default() -> Self {
        let mut context = imgui::Context::create();
        context.set_ini_filename(None::<PathBuf>);
        Self {
            context,
            responses: HashMap::new(),
            capture: UiCaptureState::default(),
            font_ids: HashMap::new(),
            loaded_fonts: HashMap::new(),
            demo_open: true,
            metrics_open: true,
        }
    }
}

impl DearImGuiUi {
    pub fn context_mut(&mut self) -> &mut imgui::Context {
        &mut self.context
    }

    pub fn take_frame_readback(&mut self) -> (Vec<(u32, UiResponse)>, UiCaptureState) {
        (
            std::mem::take(&mut self.responses).into_iter().collect(),
            self.capture,
        )
    }

    pub fn register_fonts(&mut self, commands: &[UiCommand]) -> bool {
        let mut changed = false;
        for command in commands.iter().filter(|command| {
            command.backend == UiBackend::DearImGui && command.opcode == UiOpcode::LoadFont
        }) {
            if command.scratch.is_empty() || command.scratch.len() > MAX_FONT_BYTES {
                continue;
            }
            let Some(bytes) = command
                .scratch
                .iter()
                .map(|value| {
                    (value.is_finite() && *value >= 0.0 && *value <= 255.0 && value.fract() == 0.0)
                        .then_some(*value as u8)
                })
                .collect::<Option<Vec<_>>>()
            else {
                continue;
            };
            if self.loaded_fonts.get(&command.id) == Some(&bytes) {
                continue;
            }
            let name = if command.text.trim().is_empty() {
                format!("bornengine-debug-font-{}", command.id)
            } else {
                command.text.clone()
            };
            let font_id = self.context.fonts().add_font(&[FontSource::TtfData {
                data: &bytes,
                size_pixels: 16.0,
                config: Some(FontConfig {
                    name: Some(name),
                    ..FontConfig::default()
                }),
            }]);
            self.font_ids.insert(command.id, font_id);
            self.loaded_fonts.insert(command.id, bytes);
            changed = true;
        }
        changed
    }

    pub fn prepare_frame<'a>(
        &'a mut self,
        commands: &[UiCommand],
        input: &UiInputSnapshot,
        display_size: [f32; 2],
        framebuffer_scale: f32,
        dt: f64,
        texture_ids: &HashMap<u64, (imgui::TextureId, [f32; 2])>,
    ) -> &'a imgui::DrawData {
        let DearImGuiUi {
            context,
            responses,
            capture,
            font_ids,
            demo_open,
            metrics_open,
            ..
        } = self;

        apply_theme(context, commands);
        {
            let io = context.io_mut();
            io.display_size = [display_size[0].max(1.0), display_size[1].max(1.0)];
            io.display_framebuffer_scale = [framebuffer_scale.max(0.1); 2];
            io.update_delta_time(Duration::from_secs_f64(if dt.is_finite() {
                dt.clamp(1.0 / 1000.0, 0.25)
            } else {
                1.0 / 60.0
            }));
            io.key_ctrl = input.modifiers.ctrl;
            io.key_shift = input.modifiers.shift;
            io.key_alt = input.modifiers.alt;
            io.key_super = input.modifiers.super_key;
            if let Some([x, y]) = input.pointer_position {
                if x.is_finite() && y.is_finite() {
                    io.add_mouse_pos_event([x as f32, y as f32]);
                } else {
                    io.add_mouse_pos_event([-f32::MAX, -f32::MAX]);
                }
            } else {
                io.add_mouse_pos_event([-f32::MAX, -f32::MAX]);
            }
            for event in &input.pointer_buttons {
                if let Some(button) = mouse_button(event.button) {
                    io.add_mouse_button_event(button, event.pressed);
                }
            }
            if input.scroll_x.is_finite() || input.scroll_y.is_finite() {
                io.add_mouse_wheel_event([
                    if input.scroll_x.is_finite() {
                        input.scroll_x as f32
                    } else {
                        0.0
                    },
                    if input.scroll_y.is_finite() {
                        input.scroll_y as f32
                    } else {
                        0.0
                    },
                ]);
            }
            for event in input.ordered_key_text_events() {
                match event {
                    UiInputEvent::Key(key_event) => {
                        if let Some(key) = key_from_bloom(key_event.key) {
                            io.add_key_event(key, key_event.pressed);
                        }
                    }
                    UiInputEvent::Text(text) => {
                        for character in text.chars() {
                            io.add_input_character(character);
                        }
                    }
                }
            }
        }

        let commands: Vec<_> = commands
            .iter()
            .filter(|command| command.backend == UiBackend::DearImGui)
            .cloned()
            .collect();
        let pairs = container_pairs(&commands);
        let mut positions = HashMap::new();
        let mut sizes = HashMap::new();
        for command in &commands {
            match command.opcode {
                UiOpcode::SetWindowPosition => {
                    if let (Some(x), Some(y)) =
                        (finite_f32(command.args[0]), finite_f32(command.args[1]))
                    {
                        positions.insert(command.id, ([x, y], command.args[2] != 0.0));
                    }
                }
                UiOpcode::SetWindowSize => {
                    if let (Some(width), Some(height)) =
                        (finite_f32(command.args[0]), finite_f32(command.args[1]))
                    {
                        sizes.insert(
                            command.id,
                            ([width.max(32.0), height.max(32.0)], command.args[2] != 0.0),
                        );
                    }
                }
                _ => {}
            }
        }

        let mut eval = EvalState {
            commands: &commands,
            pairs,
            positions,
            sizes,
            texture_ids,
            responses: HashMap::new(),
            text_edit_focused: false,
            demo_open,
            metrics_open,
        };
        let ui = context.frame();
        let selected_font = commands.iter().rev().find_map(|command| {
            if command.opcode == UiOpcode::SetStyle && finite_usize(command.args[0]) == Some(2) {
                finite_u32(command.args[1]).and_then(|id| font_ids.get(&id).copied())
            } else {
                None
            }
        });
        if let Some(font_id) = selected_font {
            let _font = ui.push_font(font_id);
            eval.render_range(&ui, 0, eval.commands.len(), false);
        } else {
            eval.render_range(&ui, 0, eval.commands.len(), false);
        }
        let text_edit_focused = eval.text_edit_focused;
        *responses = eval.responses;

        *capture = UiCaptureState {
            pointer: context.io().want_capture_mouse,
            keyboard: context.io().want_capture_keyboard,
        };
        let _ = text_edit_focused;
        context.render()
    }
}

struct EvalState<'a> {
    commands: &'a [UiCommand],
    pairs: HashMap<usize, usize>,
    positions: HashMap<u32, ([f32; 2], bool)>,
    sizes: HashMap<u32, ([f32; 2], bool)>,
    texture_ids: &'a HashMap<u64, (imgui::TextureId, [f32; 2])>,
    responses: HashMap<u32, UiResponse>,
    text_edit_focused: bool,
    demo_open: &'a mut bool,
    metrics_open: &'a mut bool,
}

impl EvalState<'_> {
    fn render_range(&mut self, ui: &Ui, start: usize, end: usize, horizontal: bool) {
        let mut index = start;
        let mut first_item = true;
        while index < end {
            let command = &self.commands[index];
            let pair = self
                .pairs
                .get(&index)
                .copied()
                .filter(|pair_end| *pair_end < end);
            if horizontal && is_visual(command.opcode) {
                if first_item {
                    first_item = false;
                } else {
                    ui.same_line();
                }
            }
            match command.opcode {
                UiOpcode::BeginWindow if pair.is_some() => {
                    let close = pair.unwrap();
                    let (position, position_always) = self
                        .positions
                        .get(&command.id)
                        .copied()
                        .unwrap_or(([16.0, 16.0], false));
                    let (size, size_always) = self
                        .sizes
                        .get(&command.id)
                        .copied()
                        .unwrap_or(([320.0, 240.0], false));
                    let name = format!("{}##bornengine-ui-{}", command.text, command.id);
                    ui.window(name)
                        .position(position, condition(position_always))
                        .size(size, condition(size_always))
                        .build(|| self.render_range(ui, index + 1, close, false));
                    index = close + 1;
                }
                UiOpcode::BeginPanel | UiOpcode::BeginScrollArea if pair.is_some() => {
                    let close = pair.unwrap();
                    let child = ui
                        .child_window(format!("##bornengine-ui-child-{}", command.id))
                        .size([0.0, 0.0])
                        .border(command.opcode == UiOpcode::BeginPanel)
                        .begin();
                    if child.is_some() {
                        self.render_range(ui, index + 1, close, false);
                    }
                    drop(child);
                    index = close + 1;
                }
                UiOpcode::BeginHorizontal if pair.is_some() => {
                    let close = pair.unwrap();
                    self.render_range(ui, index + 1, close, true);
                    index = close + 1;
                }
                UiOpcode::BeginVertical if pair.is_some() => {
                    let close = pair.unwrap();
                    self.render_range(ui, index + 1, close, false);
                    index = close + 1;
                }
                UiOpcode::BeginTabBar if pair.is_some() => {
                    let close = pair.unwrap();
                    let token = ui.tab_bar(format!("bornengine-ui-tabs-{}", command.id));
                    if token.is_some() {
                        self.render_range(ui, index + 1, close, false);
                    }
                    drop(token);
                    index = close + 1;
                }
                UiOpcode::BeginTabItem if pair.is_some() => {
                    let close = pair.unwrap();
                    let token = ui.tab_item(&command.text);
                    let opened = token.is_some();
                    if opened {
                        self.render_range(ui, index + 1, close, false);
                    }
                    self.responses.insert(
                        command.id,
                        UiResponse {
                            value: if opened { 1.0 } else { 0.0 },
                            ..UiResponse::default()
                        },
                    );
                    drop(token);
                    index = close + 1;
                }
                UiOpcode::Combo if pair.is_some() => {
                    let close = pair.unwrap();
                    let token = ui.begin_combo(&command.id.to_string(), &command.text);
                    let opened = token.is_some();
                    if opened {
                        self.render_range(ui, index + 1, close, false);
                    }
                    self.responses.insert(
                        command.id,
                        UiResponse {
                            value: if opened { 1.0 } else { 0.0 },
                            ..UiResponse::default()
                        },
                    );
                    drop(token);
                    index = close + 1;
                }
                UiOpcode::BeginMenuBar if pair.is_some() => {
                    let close = pair.unwrap();
                    let token = ui.begin_menu_bar();
                    if token.is_some() {
                        self.render_range(ui, index + 1, close, false);
                    }
                    drop(token);
                    index = close + 1;
                }
                UiOpcode::BeginMenu if pair.is_some() => {
                    let close = pair.unwrap();
                    let token = ui.begin_menu(&command.text);
                    let opened = token.is_some();
                    if opened {
                        self.render_range(ui, index + 1, close, false);
                    }
                    self.responses.insert(
                        command.id,
                        UiResponse {
                            value: if opened { 1.0 } else { 0.0 },
                            ..UiResponse::default()
                        },
                    );
                    drop(token);
                    index = close + 1;
                }
                UiOpcode::BeginTable if pair.is_some() => {
                    let close = pair.unwrap();
                    let columns = finite_usize(command.args[0]).unwrap_or(1).clamp(1, 64);
                    let token =
                        ui.begin_table(format!("bornengine-ui-table-{}", command.id), columns);
                    if token.is_some() {
                        self.render_range(ui, index + 1, close, false);
                    }
                    drop(token);
                    index = close + 1;
                }
                UiOpcode::CollapsingHeader if pair.is_some() => {
                    let close = pair.unwrap();
                    let opened = ui.collapsing_header(&command.text, imgui::TreeNodeFlags::empty());
                    self.responses.insert(
                        command.id,
                        UiResponse {
                            value: if opened { 1.0 } else { 0.0 },
                            ..UiResponse::default()
                        },
                    );
                    if opened {
                        self.render_range(ui, index + 1, close, false);
                    }
                    index = close + 1;
                }
                UiOpcode::TreeNode if pair.is_some() => {
                    let close = pair.unwrap();
                    let id_scope = ui.push_id(format!("bornengine-ui-tree-{}", command.id));
                    let token = ui.tree_node(&command.text);
                    let opened = token.is_some();
                    self.responses.insert(
                        command.id,
                        UiResponse {
                            value: if opened { 1.0 } else { 0.0 },
                            ..UiResponse::default()
                        },
                    );
                    if opened {
                        self.render_range(ui, index + 1, close, false);
                    }
                    drop(token);
                    drop(id_scope);
                    index = close + 1;
                }
                UiOpcode::Spacing => {
                    let amount = finite_f32(command.args[0]).unwrap_or(8.0).max(0.0);
                    ui.dummy([1.0, amount]);
                    index += 1;
                }
                UiOpcode::Separator => {
                    ui.separator();
                    index += 1;
                }
                UiOpcode::Label => {
                    ui.text(&command.text);
                    index += 1;
                }
                UiOpcode::Link | UiOpcode::Button => {
                    let id_scope = ui.push_id(format!("bornengine-ui-link-{}", command.id));
                    let clicked = ui.button(&command.text);
                    self.store_item(ui, command.id, clicked, false, 0.0, String::new());
                    drop(id_scope);
                    index += 1;
                }
                UiOpcode::Checkbox => {
                    let mut value = command.args[0] != 0.0;
                    let id_scope = ui.push_id(format!("bornengine-ui-checkbox-{}", command.id));
                    let changed = ui.checkbox(&command.text, &mut value);
                    self.store_item(
                        ui,
                        command.id,
                        changed,
                        changed,
                        if value { 1.0 } else { 0.0 },
                        String::new(),
                    );
                    drop(id_scope);
                    index += 1;
                }
                UiOpcode::RadioButton => {
                    let id_scope = ui.push_id(format!("bornengine-ui-radio-{}", command.id));
                    let clicked = ui.radio_button_bool(&command.text, command.args[0] != 0.0);
                    self.store_item(
                        ui,
                        command.id,
                        clicked,
                        clicked,
                        if clicked { 1.0 } else { command.args[0] },
                        String::new(),
                    );
                    drop(id_scope);
                    index += 1;
                }
                UiOpcode::SliderFloat => {
                    let mut value = finite_f32(command.args[0]).unwrap_or(0.0);
                    let min = finite_f32(command.args[1]).unwrap_or(0.0);
                    let max = finite_f32(command.args[2]).unwrap_or(1.0);
                    let id_scope = ui.push_id(format!("bornengine-ui-slider-float-{}", command.id));
                    let changed = ui.slider(&command.text, min.min(max), min.max(max), &mut value);
                    self.store_item(
                        ui,
                        command.id,
                        false,
                        changed,
                        f64::from(value),
                        String::new(),
                    );
                    drop(id_scope);
                    index += 1;
                }
                UiOpcode::SliderInt => {
                    let mut value = command.args[0].round() as i32;
                    let min = command.args[1].round() as i32;
                    let max = command.args[2].round() as i32;
                    let id_scope = ui.push_id(format!("bornengine-ui-slider-int-{}", command.id));
                    let changed = ui.slider(&command.text, min.min(max), min.max(max), &mut value);
                    self.store_item(
                        ui,
                        command.id,
                        false,
                        changed,
                        f64::from(value),
                        String::new(),
                    );
                    drop(id_scope);
                    index += 1;
                }
                UiOpcode::DragFloat => {
                    let mut value = finite_f32(command.args[0]).unwrap_or(0.0);
                    let speed = finite_f32(command.args[1])
                        .unwrap_or(0.1)
                        .abs()
                        .max(0.000_001);
                    let mut drag = imgui::Drag::<f32, _>::new(&command.text).speed(speed);
                    if let (Some(min), Some(max)) =
                        (finite_f32(command.args[2]), finite_f32(command.args[3]))
                    {
                        drag = drag.range(min.min(max), min.max(max));
                    }
                    let id_scope = ui.push_id(format!("bornengine-ui-drag-{}", command.id));
                    let changed = drag.build(ui, &mut value);
                    self.store_item(
                        ui,
                        command.id,
                        false,
                        changed,
                        f64::from(value),
                        String::new(),
                    );
                    drop(id_scope);
                    index += 1;
                }
                UiOpcode::TextEdit => {
                    let mut value = command.text.clone();
                    let id_scope = ui.push_id(format!("bornengine-ui-text-{}", command.id));
                    let changed = ui
                        .input_text(&format!("##bornengine-ui-text-{}", command.id), &mut value)
                        .build();
                    self.text_edit_focused |= ui.is_item_focused();
                    self.store_item(ui, command.id, false, changed, 0.0, value);
                    drop(id_scope);
                    index += 1;
                }
                UiOpcode::Selectable => {
                    let id_scope = ui.push_id(format!("bornengine-ui-selectable-{}", command.id));
                    let clicked = ui
                        .selectable_config(&command.text)
                        .selected(command.args[0] != 0.0)
                        .build();
                    self.store_item(
                        ui,
                        command.id,
                        clicked,
                        clicked,
                        if clicked { 1.0 } else { 0.0 },
                        String::new(),
                    );
                    drop(id_scope);
                    index += 1;
                }
                UiOpcode::ProgressBar => {
                    let fraction = finite_f32(command.args[0]).unwrap_or(0.0).clamp(0.0, 1.0);
                    imgui::ProgressBar::new(fraction)
                        .overlay_text(&command.text)
                        .build(ui);
                    self.responses.insert(
                        command.id,
                        UiResponse {
                            value: f64::from(fraction),
                            ..UiResponse::default()
                        },
                    );
                    index += 1;
                }
                UiOpcode::Image => {
                    let handle = finite_u64(command.args[0]);
                    if let Some((texture_id, texture_size)) =
                        handle.and_then(|handle| self.texture_ids.get(&handle).copied())
                    {
                        let size = [
                            finite_f32(command.args[1]).unwrap_or(0.0).max(0.0),
                            finite_f32(command.args[2]).unwrap_or(0.0).max(0.0),
                        ];
                        let size = [
                            if size[0] > 0.0 {
                                size[0]
                            } else {
                                texture_size[0]
                            },
                            if size[1] > 0.0 {
                                size[1]
                            } else {
                                texture_size[1]
                            },
                        ];
                        imgui::Image::new(texture_id, size).build(ui);
                        self.responses.insert(
                            command.id,
                            UiResponse {
                                value: handle.unwrap_or_default() as f64,
                                ..UiResponse::default()
                            },
                        );
                    } else {
                        ui.text("[texture unavailable]");
                        self.responses.insert(command.id, UiResponse::default());
                    }
                    index += 1;
                }
                UiOpcode::PaintLine
                | UiOpcode::PaintRect
                | UiOpcode::PaintCircle
                | UiOpcode::PaintText
                | UiOpcode::PaintPolyline
                | UiOpcode::PaintPolygon => {
                    self.paint(ui, command);
                    self.responses.insert(command.id, UiResponse::default());
                    index += 1;
                }
                UiOpcode::MenuItem => {
                    let id_scope = ui.push_id(format!("bornengine-ui-menu-item-{}", command.id));
                    let clicked = ui.menu_item(&command.text);
                    self.store_item(
                        ui,
                        command.id,
                        clicked,
                        false,
                        if clicked { 1.0 } else { 0.0 },
                        String::new(),
                    );
                    drop(id_scope);
                    index += 1;
                }
                UiOpcode::DemoWindow => {
                    ui.show_demo_window(self.demo_open);
                    index += 1;
                }
                UiOpcode::MetricsWindow => {
                    ui.show_metrics_window(self.metrics_open);
                    index += 1;
                }
                UiOpcode::SetStyle | UiOpcode::LoadFont | UiOpcode::RegisterTexture => {
                    index += 1;
                }
                UiOpcode::BeginPanel
                | UiOpcode::BeginWindow
                | UiOpcode::Combo
                | UiOpcode::CollapsingHeader
                | UiOpcode::BeginScrollArea
                | UiOpcode::BeginTabBar
                | UiOpcode::BeginTabItem
                | UiOpcode::BeginMenuBar
                | UiOpcode::BeginMenu
                | UiOpcode::BeginTable
                | UiOpcode::TreeNode
                | UiOpcode::EndWindow
                | UiOpcode::EndPanel
                | UiOpcode::BeginHorizontal
                | UiOpcode::EndHorizontal
                | UiOpcode::BeginVertical
                | UiOpcode::EndVertical
                | UiOpcode::SetWindowPosition
                | UiOpcode::SetWindowSize
                | UiOpcode::EndScrollArea
                | UiOpcode::EndTabBar
                | UiOpcode::EndTabItem
                | UiOpcode::EndCombo
                | UiOpcode::EndCollapsingHeader
                | UiOpcode::EndMenuBar
                | UiOpcode::EndMenu
                | UiOpcode::TreePop
                | UiOpcode::EndTable
                | UiOpcode::TableNextRow
                | UiOpcode::TableNextColumn
                | UiOpcode::PlotLines => {
                    match command.opcode {
                        UiOpcode::TableNextRow => ui.table_next_row(),
                        UiOpcode::TableNextColumn => {
                            ui.table_next_column();
                        }
                        _ => {}
                    }
                    index += 1;
                }
            }
        }
    }

    fn store_item(
        &mut self,
        ui: &Ui,
        id: u32,
        clicked: bool,
        changed: bool,
        value: f64,
        text: String,
    ) {
        self.responses.insert(
            id,
            UiResponse {
                clicked,
                changed,
                hovered: ui.is_item_hovered(),
                focused: ui.is_item_focused(),
                dragged: ui.is_item_active(),
                value,
                text,
            },
        );
    }

    fn paint(&mut self, ui: &Ui, command: &UiCommand) {
        let values = &command.scratch;
        let Some(origin) = values_origin(ui) else {
            return;
        };
        let coordinate = |index: usize| values.get(index).copied().and_then(finite_f32);
        let color = |start: usize| rgba(values, start);
        let draw = ui.get_window_draw_list();
        match command.opcode {
            UiOpcode::PaintLine if values.len() >= 9 => {
                if let (Some(x1), Some(y1), Some(x2), Some(y2)) =
                    (coordinate(0), coordinate(1), coordinate(2), coordinate(3))
                {
                    draw.add_line(
                        [origin[0] + x1, origin[1] + y1],
                        [origin[0] + x2, origin[1] + y2],
                        color(4),
                    )
                    .thickness(coordinate(8).unwrap_or(1.0).max(0.1))
                    .build();
                }
            }
            UiOpcode::PaintRect if values.len() >= 8 => {
                if let (Some(x), Some(y), Some(width), Some(height)) =
                    (coordinate(0), coordinate(1), coordinate(2), coordinate(3))
                {
                    draw.add_rect(
                        [origin[0] + x, origin[1] + y],
                        [
                            origin[0] + x + width.max(0.0),
                            origin[1] + y + height.max(0.0),
                        ],
                        color(4),
                    )
                    .filled(true)
                    .build();
                }
            }
            UiOpcode::PaintCircle if values.len() >= 8 => {
                if let (Some(x), Some(y), Some(radius)) =
                    (coordinate(0), coordinate(1), coordinate(2))
                {
                    draw.add_circle([origin[0] + x, origin[1] + y], radius.max(0.0), color(3))
                        .thickness(coordinate(7).unwrap_or(1.0).max(0.1))
                        .build();
                }
            }
            UiOpcode::PaintText if values.len() >= 7 => {
                if let (Some(x), Some(y)) = (coordinate(0), coordinate(1)) {
                    draw.add_text([origin[0] + x, origin[1] + y], color(3), &command.text);
                }
            }
            UiOpcode::PaintPolyline | UiOpcode::PaintPolygon => {
                let coordinate_count = values.len().saturating_sub(5) & !1;
                let mut points: Vec<[f32; 2]> = values[..coordinate_count]
                    .chunks_exact(2)
                    .filter_map(|point| {
                        Some([
                            origin[0] + finite_f32(point[0])?,
                            origin[1] + finite_f32(point[1])?,
                        ])
                    })
                    .collect();
                if command.opcode == UiOpcode::PaintPolygon && points.len() > 2 {
                    points.push(points[0]);
                }
                if points.len() >= 2 {
                    draw.add_polyline(points, color(coordinate_count))
                        .thickness(coordinate(coordinate_count + 4).unwrap_or(1.0).max(0.1))
                        .build();
                }
            }
            _ => {}
        }
    }
}

fn apply_theme(context: &mut imgui::Context, commands: &[UiCommand]) {
    let theme = commands.iter().rev().find_map(|command| {
        if command.opcode == UiOpcode::SetStyle {
            match finite_usize(command.args[0]) {
                Some(0) => Some(false),
                Some(1) => Some(true),
                _ => None,
            }
        } else {
            None
        }
    });
    if let Some(light) = theme {
        if light {
            context.style_mut().use_light_colors();
        } else {
            context.style_mut().use_dark_colors();
        }
    }
}

fn condition(always: bool) -> Condition {
    if always {
        Condition::Always
    } else {
        Condition::FirstUseEver
    }
}

fn is_visual(opcode: UiOpcode) -> bool {
    matches!(
        opcode,
        UiOpcode::BeginWindow
            | UiOpcode::BeginPanel
            | UiOpcode::BeginHorizontal
            | UiOpcode::BeginVertical
            | UiOpcode::BeginScrollArea
            | UiOpcode::BeginTabBar
            | UiOpcode::BeginTabItem
            | UiOpcode::Combo
            | UiOpcode::BeginMenu
            | UiOpcode::BeginTable
            | UiOpcode::CollapsingHeader
            | UiOpcode::TreeNode
            | UiOpcode::Label
            | UiOpcode::Link
            | UiOpcode::Button
            | UiOpcode::Checkbox
            | UiOpcode::RadioButton
            | UiOpcode::SliderFloat
            | UiOpcode::SliderInt
            | UiOpcode::DragFloat
            | UiOpcode::TextEdit
            | UiOpcode::Selectable
            | UiOpcode::ProgressBar
            | UiOpcode::Image
            | UiOpcode::PaintLine
            | UiOpcode::PaintRect
            | UiOpcode::PaintCircle
            | UiOpcode::PaintText
            | UiOpcode::PaintPolyline
            | UiOpcode::PaintPolygon
            | UiOpcode::MenuItem
            | UiOpcode::DemoWindow
            | UiOpcode::MetricsWindow
    )
}

fn container_pairs(commands: &[UiCommand]) -> HashMap<usize, usize> {
    let mut stack: Vec<(usize, UiOpcode)> = Vec::new();
    let mut pairs = HashMap::new();
    for (index, command) in commands.iter().enumerate() {
        if let Some(end) = matching_end(command.opcode) {
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

fn matching_end(opcode: UiOpcode) -> Option<UiOpcode> {
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

fn mouse_button(button: u8) -> Option<MouseButton> {
    Some(match button {
        0 => MouseButton::Left,
        1 => MouseButton::Right,
        2 => MouseButton::Middle,
        3 => MouseButton::Extra1,
        4 => MouseButton::Extra2,
        _ => return None,
    })
}

fn key_from_bloom(code: u32) -> Option<Key> {
    Some(match code {
        32 => Key::Space,
        8 => Key::Backspace,
        9 => Key::Tab,
        13 | 265 => Key::Enter,
        27 => Key::Escape,
        127 => Key::Delete,
        256 => Key::UpArrow,
        257 => Key::DownArrow,
        258 => Key::LeftArrow,
        259 => Key::RightArrow,
        260 => Key::Insert,
        261 => Key::Home,
        262 => Key::End,
        263 => Key::PageUp,
        264 => Key::PageDown,
        280 => Key::LeftShift,
        281 => Key::RightShift,
        282 => Key::LeftCtrl,
        283 => Key::RightCtrl,
        284 => Key::LeftAlt,
        285 => Key::RightAlt,
        286 => Key::LeftSuper,
        287 => Key::RightSuper,
        48..=57 => [
            Key::Alpha0,
            Key::Alpha1,
            Key::Alpha2,
            Key::Alpha3,
            Key::Alpha4,
            Key::Alpha5,
            Key::Alpha6,
            Key::Alpha7,
            Key::Alpha8,
            Key::Alpha9,
        ][(code - 48) as usize],
        65..=90 => [
            Key::A,
            Key::B,
            Key::C,
            Key::D,
            Key::E,
            Key::F,
            Key::G,
            Key::H,
            Key::I,
            Key::J,
            Key::K,
            Key::L,
            Key::M,
            Key::N,
            Key::O,
            Key::P,
            Key::Q,
            Key::R,
            Key::S,
            Key::T,
            Key::U,
            Key::V,
            Key::W,
            Key::X,
            Key::Y,
            Key::Z,
        ][(code - 65) as usize],
        112..=123 => [
            Key::F1,
            Key::F2,
            Key::F3,
            Key::F4,
            Key::F5,
            Key::F6,
            Key::F7,
            Key::F8,
            Key::F9,
            Key::F10,
            Key::F11,
            Key::F12,
        ][(code - 112) as usize],
        39 => Key::Apostrophe,
        44 => Key::Comma,
        45 => Key::Minus,
        46 => Key::Period,
        47 => Key::Slash,
        59 => Key::Semicolon,
        61 => Key::Equal,
        91 => Key::LeftBracket,
        92 => Key::Backslash,
        93 => Key::RightBracket,
        96 => Key::GraveAccent,
        _ => return None,
    })
}

fn values_origin(ui: &Ui) -> Option<[f32; 2]> {
    let window = ui.window_pos();
    let cursor = ui.cursor_start_pos();
    let position = [window[0] + cursor[0], window[1] + cursor[1]];
    (position[0].is_finite() && position[1].is_finite()).then_some(position)
}

fn rgba(values: &[f64], start: usize) -> imgui::ImColor32 {
    let component = |index: usize| values.get(index).copied().map(color_channel).unwrap_or(255);
    imgui::ImColor32::from_rgba(
        component(start),
        component(start + 1),
        component(start + 2),
        component(start + 3),
    )
}

fn finite_f32(value: f64) -> Option<f32> {
    (value.is_finite() && value.abs() <= f32::MAX as f64).then_some(value as f32)
}

fn finite_usize(value: f64) -> Option<usize> {
    (value.is_finite() && value >= 0.0 && value.fract() == 0.0 && value <= usize::MAX as f64)
        .then_some(value as usize)
}

fn finite_u32(value: f64) -> Option<u32> {
    (value.is_finite() && value >= 0.0 && value.fract() == 0.0 && value <= u32::MAX as f64)
        .then_some(value as u32)
}

fn finite_u64(value: f64) -> Option<u64> {
    (value.is_finite() && value >= 0.0 && value.fract() == 0.0 && value <= u64::MAX as f64)
        .then_some(value as u64)
}

#[cfg(test)]
mod tests {
    use super::rgba;

    #[test]
    fn paint_color_channels_use_engine_byte_range() {
        assert_eq!(
            rgba(&[128.0, 64.0, 255.0, 200.0], 0).to_rgba(),
            [128, 64, 255, 200]
        );
    }
}
