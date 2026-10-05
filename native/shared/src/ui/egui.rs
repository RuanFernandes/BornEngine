use std::collections::{BTreeMap, HashMap, HashSet};
use std::sync::Arc;

use egui::{
    Align2, Color32, Context, Event, Id, Key, Modifiers, MouseWheelUnit, PointerButton, Pos2,
    RawInput, Rect, Shape, Stroke, TouchDeviceId, TouchId, TouchPhase, Ui, Vec2,
};

use super::{
    color_channel, UiBackend, UiCommand, UiInputEvent, UiInputSnapshot, UiOpcode, UiResponse,
};
use crate::gui::{GuiCommand, GuiEventRecord, GuiEventType, GuiOpcode, GuiResponse};

#[derive(Default)]
pub struct EguiUi {
    context: Context,
    elapsed_seconds: f64,
    native_pixels_per_point: Option<f32>,
    active_touches: HashSet<usize>,
    active_tabs: HashMap<u32, u32>,
    gui_window_bounds: HashMap<u32, [f32; 4]>,
    gui_window_requested_bounds: HashMap<u32, [f32; 4]>,
    gui_frame_set_column_weights: HashMap<u32, Vec<f32>>,
    gui_frame_set_row_weights: HashMap<u32, Vec<f32>>,
    gui_hovered: HashSet<u32>,
    gui_focused: HashSet<u32>,
    custom_fonts: BTreeMap<u32, (String, Arc<egui::FontData>)>,
}

pub struct EguiFrameOutput {
    pub paint_jobs: Vec<egui::epaint::ClippedPrimitive>,
    pub textures_delta: egui::TexturesDelta,
    pub platform_output: egui::PlatformOutput,
    pub pixels_per_point: f32,
    pub responses: HashMap<u32, UiResponse>,
    pub registered_textures: HashMap<u32, u64>,
    pub wants_pointer_input: bool,
    pub wants_keyboard_input: bool,
    pub text_edit_focused: bool,
    pub gui_responses: HashMap<u32, GuiResponse>,
    pub gui_events: Vec<GuiEventRecord>,
    pub gui_wants_pointer_input: bool,
    pub gui_wants_keyboard_input: bool,
    pub gui_control_bounds: HashMap<u32, [f64; 4]>,
    pub gui_clip_bounds: HashMap<u32, [f64; 4]>,
    pub gui_background_colors: HashMap<u32, [u8; 4]>,
    pub gui_scroll_offsets: HashMap<u32, [f32; 2]>,
}

impl EguiFrameOutput {
    pub fn response(&self, id: u32) -> UiResponse {
        self.responses.get(&id).cloned().unwrap_or_default()
    }

    pub fn gui_response(&self, id: u32) -> GuiResponse {
        self.gui_responses.get(&id).cloned().unwrap_or_default()
    }
}

impl EguiUi {
    pub fn set_native_pixels_per_point(&mut self, pixels_per_point: f32) {
        if pixels_per_point.is_finite() && pixels_per_point > 0.0 {
            self.native_pixels_per_point = Some(pixels_per_point);
        }
    }

    pub fn run_frame(
        &mut self,
        commands: &[UiCommand],
        gui_commands: &[GuiCommand],
        input: UiInputSnapshot,
        screen_rect: [f32; 4],
        pixels_per_point: f32,
        dt: f64,
    ) -> EguiFrameOutput {
        self.set_native_pixels_per_point(pixels_per_point);
        let live_window_ids: HashSet<u32> = gui_commands
            .iter()
            .filter(|command| {
                command.opcode == GuiOpcode::Control
                    && finite_usize(command.scratch.first().copied().unwrap_or(-1.0)) == Some(2)
            })
            .map(|command| command.id)
            .collect();
        let live_frame_set_ids: HashSet<u32> = gui_commands
            .iter()
            .filter(|command| {
                command.opcode == GuiOpcode::Control
                    && finite_usize(command.scratch.first().copied().unwrap_or(-1.0)) == Some(6)
            })
            .map(|command| command.id)
            .collect();
        self.gui_window_bounds
            .retain(|id, _| live_window_ids.contains(id));
        self.gui_window_requested_bounds
            .retain(|id, _| live_window_ids.contains(id));
        self.gui_frame_set_column_weights
            .retain(|id, _| live_frame_set_ids.contains(id));
        self.gui_frame_set_row_weights
            .retain(|id, _| live_frame_set_ids.contains(id));
        self.elapsed_seconds += if dt.is_finite() {
            dt.clamp(0.0, 0.25)
        } else {
            1.0 / 60.0
        };

        let commands: Vec<_> = commands
            .iter()
            .filter(|command| command.backend == UiBackend::Egui)
            .cloned()
            .collect();
        self.register_fonts(&commands);
        let pairs = container_pairs(&commands);
        let mut positions = HashMap::new();
        let mut sizes = HashMap::new();
        for command in &commands {
            match command.opcode {
                UiOpcode::SetWindowPosition => {
                    if let (Some(x), Some(y)) =
                        (finite_f32(command.args[0]), finite_f32(command.args[1]))
                    {
                        positions.insert(command.id, Pos2::new(x, y));
                    }
                }
                UiOpcode::SetWindowSize => {
                    if let (Some(width), Some(height)) =
                        (finite_f32(command.args[0]), finite_f32(command.args[1]))
                    {
                        sizes.insert(command.id, Vec2::new(width.max(32.0), height.max(32.0)));
                    }
                }
                _ => {}
            }
        }

        let modifiers = to_egui_modifiers(input.modifiers);
        let mut events = Vec::new();
        if let Some([x, y]) = input.pointer_position {
            if x.is_finite() && y.is_finite() {
                let position = Pos2::new(x as f32, y as f32);
                events.push(Event::PointerMoved(position));
                if input.pointer_delta[0].is_finite() && input.pointer_delta[1].is_finite() {
                    let delta =
                        Vec2::new(input.pointer_delta[0] as f32, input.pointer_delta[1] as f32);
                    if delta != Vec2::ZERO {
                        events.push(Event::MouseMoved(delta));
                    }
                }
                for button_event in &input.pointer_buttons {
                    if let Some(button) = pointer_button(button_event.button) {
                        events.push(Event::PointerButton {
                            pos: position,
                            button,
                            pressed: button_event.pressed,
                            modifiers,
                        });
                    }
                }
            }
        }
        if input.scroll_x.is_finite() || input.scroll_y.is_finite() {
            let delta = Vec2::new(
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
            );
            if delta != Vec2::ZERO {
                events.push(Event::MouseWheel {
                    unit: MouseWheelUnit::Line,
                    delta,
                    phase: TouchPhase::Move,
                    modifiers,
                });
            }
        }
        for event in input.ordered_key_text_events() {
            match event {
                UiInputEvent::Key(key_event) => {
                    if let Some(key) = key_from_bloom(key_event.key) {
                        events.push(Event::Key {
                            key,
                            physical_key: None,
                            pressed: key_event.pressed,
                            repeat: key_event.repeated,
                            modifiers,
                        });
                    }
                }
                UiInputEvent::Text(text) if !text.is_empty() => events.push(Event::Text(text)),
                UiInputEvent::Text(_) => {}
            }
        }
        let gui_input = input.clone();
        let mut next_active_touches = HashSet::new();
        for touch in input.touches {
            if !touch.x.is_finite() || !touch.y.is_finite() {
                continue;
            }
            let position = Pos2::new(touch.x as f32, touch.y as f32);
            let was_active = self.active_touches.contains(&touch.slot);
            let phase = if touch.released || !touch.active {
                TouchPhase::End
            } else if was_active {
                TouchPhase::Move
            } else {
                TouchPhase::Start
            };
            events.push(Event::Touch {
                device_id: TouchDeviceId(0),
                id: TouchId(touch.slot as u64),
                phase,
                pos: position,
                force: None,
            });
            if phase == TouchPhase::Start {
                events.push(Event::PointerButton {
                    pos: position,
                    button: PointerButton::Primary,
                    pressed: true,
                    modifiers,
                });
            } else if phase == TouchPhase::End {
                events.push(Event::PointerButton {
                    pos: position,
                    button: PointerButton::Primary,
                    pressed: false,
                    modifiers,
                });
            } else {
                events.push(Event::PointerMoved(position));
            }
            if phase != TouchPhase::End && phase != TouchPhase::Cancel {
                next_active_touches.insert(touch.slot);
            }
        }
        self.active_touches = next_active_touches;

        let [x, y, width, height] = screen_rect;
        let mut raw_input = RawInput {
            screen_rect: Some(Rect::from_min_size(
                Pos2::new(x, y),
                Vec2::new(width.max(0.0), height.max(0.0)),
            )),
            time: Some(self.elapsed_seconds),
            predicted_dt: dt as f32,
            modifiers,
            events,
            ..Default::default()
        };
        if let Some(root_viewport) = raw_input.viewports.get_mut(&egui::ViewportId::ROOT) {
            root_viewport.native_pixels_per_point = self.native_pixels_per_point;
        }

        let mut state = EvalState {
            commands: &commands,
            gui_commands,
            input_snapshot: &gui_input,
            pairs,
            positions,
            sizes,
            default_window_size: Vec2::new(
                (screen_rect[2].clamp(128.0, 372.0) - 32.0).max(96.0),
                (screen_rect[3].clamp(128.0, 452.0) - 32.0).max(96.0),
            ),
            responses: HashMap::new(),
            registered_textures: HashMap::new(),
            active_tabs: &mut self.active_tabs,
            gui_window_bounds: &mut self.gui_window_bounds,
            gui_window_requested_bounds: &mut self.gui_window_requested_bounds,
            gui_frame_set_column_weights: &mut self.gui_frame_set_column_weights,
            gui_frame_set_row_weights: &mut self.gui_frame_set_row_weights,
            custom_font_names: self
                .custom_fonts
                .iter()
                .map(|(&id, (name, _))| (id, name.clone()))
                .collect(),
            text_edit_focused: false,
            gui_responses: HashMap::new(),
            gui_events: Vec::new(),
            gui_wants_pointer_input: false,
            gui_wants_keyboard_input: false,
            gui_control_bounds: HashMap::new(),
            gui_clip_bounds: HashMap::new(),
            gui_background_colors: HashMap::new(),
            gui_scroll_offsets: HashMap::new(),
            gui_hovered: HashSet::new(),
            gui_focused: HashSet::new(),
            previous_gui_hovered: &self.gui_hovered,
            previous_gui_focused: &self.gui_focused,
        };
        let context = self.context.clone();
        let viewport = Rect::from_min_size(
            Pos2::new(screen_rect[0], screen_rect[1]),
            Vec2::new(screen_rect[2].max(0.0), screen_rect[3].max(0.0)),
        );
        let full_output = context.run_ui(raw_input, |ui| {
            state.render_range(ui, 0, state.commands.len());
            state.render_gui(ui, viewport);
        });
        let paint_jobs = context.tessellate(full_output.shapes, full_output.pixels_per_point);

        let gui_hovered = std::mem::take(&mut state.gui_hovered);
        let gui_focused = std::mem::take(&mut state.gui_focused);
        let gui_scroll_offsets = std::mem::take(&mut state.gui_scroll_offsets);
        let output = EguiFrameOutput {
            paint_jobs,
            textures_delta: full_output.textures_delta,
            platform_output: full_output.platform_output,
            pixels_per_point: full_output.pixels_per_point,
            responses: state.responses,
            registered_textures: state.registered_textures,
            wants_pointer_input: context.egui_wants_pointer_input(),
            wants_keyboard_input: context.egui_wants_keyboard_input(),
            text_edit_focused: state.text_edit_focused,
            gui_responses: state.gui_responses,
            gui_events: state.gui_events,
            gui_wants_pointer_input: state.gui_wants_pointer_input,
            gui_wants_keyboard_input: state.gui_wants_keyboard_input,
            gui_control_bounds: state.gui_control_bounds,
            gui_clip_bounds: state.gui_clip_bounds,
            gui_background_colors: state.gui_background_colors,
            gui_scroll_offsets,
        };
        self.gui_hovered = gui_hovered;
        self.gui_focused = gui_focused;
        output
    }

    fn register_fonts(&mut self, commands: &[UiCommand]) {
        let mut changed = false;
        for command in commands
            .iter()
            .filter(|command| command.opcode == UiOpcode::LoadFont)
        {
            if command.scratch.is_empty() || command.scratch.len() > 1_048_576 {
                continue;
            }
            let Some(bytes) = command
                .scratch
                .iter()
                .map(|value| {
                    if value.is_finite() && *value >= 0.0 && *value <= 255.0 && value.fract() == 0.0
                    {
                        Some(*value as u8)
                    } else {
                        None
                    }
                })
                .collect::<Option<Vec<_>>>()
            else {
                continue;
            };
            let name = if command.text.trim().is_empty() {
                format!("bornengine-ui-font-{}", command.id)
            } else {
                command.text.clone()
            };
            self.custom_fonts.insert(
                command.id,
                (name, Arc::new(egui::FontData::from_owned(bytes))),
            );
            changed = true;
        }

        if changed {
            let mut definitions = egui::FontDefinitions::default();
            for (name, font_data) in self.custom_fonts.values() {
                definitions
                    .font_data
                    .insert(name.clone(), font_data.clone());
                let family = egui::FontFamily::Name(Arc::<str>::from(name.as_str()));
                definitions.families.insert(family, vec![name.clone()]);
            }
            self.context.set_fonts(definitions);
        }
    }
}

struct EvalState<'a> {
    commands: &'a [UiCommand],
    gui_commands: &'a [GuiCommand],
    input_snapshot: &'a UiInputSnapshot,
    pairs: HashMap<usize, usize>,
    positions: HashMap<u32, Pos2>,
    sizes: HashMap<u32, Vec2>,
    default_window_size: Vec2,
    responses: HashMap<u32, UiResponse>,
    registered_textures: HashMap<u32, u64>,
    active_tabs: &'a mut HashMap<u32, u32>,
    gui_window_bounds: &'a mut HashMap<u32, [f32; 4]>,
    gui_window_requested_bounds: &'a mut HashMap<u32, [f32; 4]>,
    gui_frame_set_column_weights: &'a mut HashMap<u32, Vec<f32>>,
    gui_frame_set_row_weights: &'a mut HashMap<u32, Vec<f32>>,
    custom_font_names: HashMap<u32, String>,
    text_edit_focused: bool,
    gui_responses: HashMap<u32, GuiResponse>,
    gui_events: Vec<GuiEventRecord>,
    gui_wants_pointer_input: bool,
    gui_wants_keyboard_input: bool,
    gui_control_bounds: HashMap<u32, [f64; 4]>,
    gui_clip_bounds: HashMap<u32, [f64; 4]>,
    gui_background_colors: HashMap<u32, [u8; 4]>,
    gui_scroll_offsets: HashMap<u32, [f32; 2]>,
    gui_hovered: HashSet<u32>,
    gui_focused: HashSet<u32>,
    previous_gui_hovered: &'a HashSet<u32>,
    previous_gui_focused: &'a HashSet<u32>,
}

impl EvalState<'_> {
    fn render_range(&mut self, ui: &mut Ui, start: usize, end: usize) {
        let mut index = start;
        while index < end {
            let command = &self.commands[index];
            let pair = self
                .pairs
                .get(&index)
                .copied()
                .filter(|pair_end| *pair_end < end);
            match command.opcode {
                UiOpcode::BeginWindow if pair.is_some() => {
                    let close = pair.unwrap();
                    let window_id = command.id;
                    let position = self
                        .positions
                        .get(&command.id)
                        .copied()
                        .unwrap_or(Pos2::new(16.0, 16.0));
                    let size = self
                        .sizes
                        .get(&command.id)
                        .copied()
                        .unwrap_or(self.default_window_size);
                    let title = command.text.clone();
                    let bounds = Rect::from_min_size(position, size);
                    let layout = egui::Layout::top_down(egui::Align::Min);
                    ui.scope_builder(
                        egui::UiBuilder::new().max_rect(bounds).layout(layout),
                        |window_ui| {
                            window_ui.push_id(("bornengine-ui-window", window_id), |window_ui| {
                                egui::Frame::window(window_ui.style()).show(window_ui, |content| {
                                    content
                                        .set_min_size((size - Vec2::splat(16.0)).max(Vec2::ZERO));
                                    content.label(title);
                                    content.separator();
                                    self.render_range(content, index + 1, close);
                                });
                            });
                        },
                    );
                    index = close + 1;
                }
                UiOpcode::BeginPanel if pair.is_some() => {
                    let close = pair.unwrap();
                    let id = command.id;
                    ui.push_id(("bornengine-ui-panel", id), |inner| {
                        inner.group(|inner| self.render_range(inner, index + 1, close));
                    });
                    index = close + 1;
                }
                UiOpcode::BeginHorizontal if pair.is_some() => {
                    let close = pair.unwrap();
                    let id = command.id;
                    ui.push_id(("bornengine-ui-horizontal", id), |inner| {
                        inner.horizontal(|inner| self.render_range(inner, index + 1, close));
                    });
                    index = close + 1;
                }
                UiOpcode::BeginVertical if pair.is_some() => {
                    let close = pair.unwrap();
                    let id = command.id;
                    ui.push_id(("bornengine-ui-vertical", id), |inner| {
                        inner.vertical(|inner| self.render_range(inner, index + 1, close));
                    });
                    index = close + 1;
                }
                UiOpcode::BeginScrollArea if pair.is_some() => {
                    let close = pair.unwrap();
                    let area =
                        egui::ScrollArea::vertical().id_salt(("bornengine-ui-scroll", command.id));
                    area.show(ui, |inner| self.render_range(inner, index + 1, close));
                    index = close + 1;
                }
                UiOpcode::BeginTabBar if pair.is_some() => {
                    let close = pair.unwrap();
                    self.render_tab_bar(ui, index, close, command.id);
                    index = close + 1;
                }
                UiOpcode::Combo if pair.is_some() => {
                    let close = pair.unwrap();
                    let selected = command.text.clone();
                    let combo_id = command.id;
                    let result = egui::ComboBox::from_id_salt(("bornengine-ui-combo", combo_id))
                        .selected_text(selected)
                        .show_ui(ui, |inner| self.render_range(inner, index + 1, close));
                    let response = result.response;
                    self.store_response(combo_id, &response, 0.0, String::new());
                    index = close + 1;
                }
                UiOpcode::BeginMenuBar if pair.is_some() => {
                    let close = pair.unwrap();
                    let id = command.id;
                    ui.push_id(("bornengine-ui-menubar", id), |inner| {
                        inner.horizontal(|inner| self.render_range(inner, index + 1, close));
                    });
                    index = close + 1;
                }
                UiOpcode::BeginMenu if pair.is_some() => {
                    let close = pair.unwrap();
                    let text = command.text.clone();
                    let id = command.id;
                    let response = ui
                        .push_id(("bornengine-ui-menu", id), |ui| {
                            ui.menu_button(text, |inner| self.render_range(inner, index + 1, close))
                        })
                        .inner;
                    self.store_response(id, &response.response, 0.0, String::new());
                    index = close + 1;
                }
                UiOpcode::BeginTable if pair.is_some() => {
                    let close = pair.unwrap();
                    let id = command.id;
                    let columns = finite_usize(command.args[0]).unwrap_or(1).clamp(1, 64);
                    egui::Grid::new(("bornengine-ui-table", id))
                        .num_columns(columns)
                        .striped(true)
                        .show(ui, |inner| self.render_range(inner, index + 1, close));
                    index = close + 1;
                }
                UiOpcode::CollapsingHeader if pair.is_some() => {
                    let close = pair.unwrap();
                    let id = command.id;
                    let text = command.text.clone();
                    let result = egui::CollapsingHeader::new(text)
                        .id_salt(("bornengine-ui-collapse", id))
                        .show(ui, |inner| self.render_range(inner, index + 1, close));
                    self.store_response(
                        id,
                        &result.header_response,
                        if result.fully_open() { 1.0 } else { 0.0 },
                        String::new(),
                    );
                    index = close + 1;
                }
                UiOpcode::TreeNode if pair.is_some() => {
                    let close = pair.unwrap();
                    let id = command.id;
                    let text = command.text.clone();
                    let result = egui::CollapsingHeader::new(text)
                        .id_salt(("bornengine-ui-tree", id))
                        .show(ui, |inner| self.render_range(inner, index + 1, close));
                    self.store_response(
                        id,
                        &result.header_response,
                        if result.fully_open() { 1.0 } else { 0.0 },
                        String::new(),
                    );
                    index = close + 1;
                }
                UiOpcode::Spacing => {
                    let amount = finite_f32(command.args[0]).unwrap_or(8.0).max(0.0);
                    ui.add_space(amount);
                    index += 1;
                }
                UiOpcode::Separator => {
                    ui.separator();
                    index += 1;
                }
                UiOpcode::Label => {
                    ui.label(command.text.as_str());
                    index += 1;
                }
                UiOpcode::Link => {
                    let response =
                        widget_response(ui, command.id, |ui| ui.link(command.text.as_str()));
                    self.store_response(command.id, &response, 0.0, String::new());
                    index += 1;
                }
                UiOpcode::Button => {
                    let response =
                        widget_response(ui, command.id, |ui| ui.button(command.text.as_str()));
                    self.store_response(command.id, &response, 0.0, String::new());
                    index += 1;
                }
                UiOpcode::Checkbox => {
                    let mut value = command.args[0] != 0.0;
                    let response = widget_response(ui, command.id, |ui| {
                        ui.checkbox(&mut value, command.text.as_str())
                    });
                    self.store_response(
                        command.id,
                        &response,
                        if value { 1.0 } else { 0.0 },
                        String::new(),
                    );
                    index += 1;
                }
                UiOpcode::RadioButton => {
                    let response = widget_response(ui, command.id, |ui| {
                        ui.radio(command.args[0] != 0.0, command.text.as_str())
                    });
                    self.store_response(
                        command.id,
                        &response,
                        if response.clicked() { 1.0 } else { 0.0 },
                        String::new(),
                    );
                    index += 1;
                }
                UiOpcode::SliderFloat => {
                    let mut value = finite_f64(command.args[0]).unwrap_or(0.0);
                    let min = finite_f64(command.args[1]).unwrap_or(0.0);
                    let max = finite_f64(command.args[2]).unwrap_or(1.0);
                    let range = ordered_range(min, max);
                    let response = widget_response(ui, command.id, |ui| {
                        ui.add(egui::Slider::new(&mut value, range).text(command.text.as_str()))
                    });
                    self.store_response(command.id, &response, value, String::new());
                    index += 1;
                }
                UiOpcode::SliderInt => {
                    let mut value = finite_f64(command.args[0]).unwrap_or(0.0).round() as i32;
                    let min = finite_f64(command.args[1]).unwrap_or(0.0).round() as i32;
                    let max = finite_f64(command.args[2]).unwrap_or(100.0).round() as i32;
                    let response = widget_response(ui, command.id, |ui| {
                        ui.add(
                            egui::Slider::new(&mut value, min.min(max)..=min.max(max))
                                .text(command.text.as_str()),
                        )
                    });
                    self.store_response(command.id, &response, f64::from(value), String::new());
                    index += 1;
                }
                UiOpcode::DragFloat => {
                    let mut value = finite_f64(command.args[0]).unwrap_or(0.0);
                    let speed = finite_f64(command.args[1])
                        .unwrap_or(0.1)
                        .abs()
                        .max(0.000_001);
                    let mut drag = egui::DragValue::new(&mut value)
                        .speed(speed)
                        .prefix(command.text.as_str());
                    if command.args[2].is_finite() && command.args[3].is_finite() {
                        drag = drag.range(ordered_range(command.args[2], command.args[3]));
                    }
                    let response = widget_response(ui, command.id, |ui| ui.add(drag));
                    self.store_response(command.id, &response, value, String::new());
                    index += 1;
                }
                UiOpcode::TextEdit => {
                    let mut text = command.text.clone();
                    let response = widget_response(ui, command.id, |ui| {
                        ui.add(
                            egui::TextEdit::singleline(&mut text)
                                .id_salt(("bornengine-ui-text", command.id)),
                        )
                    });
                    self.text_edit_focused |= response.has_focus();
                    self.store_response(command.id, &response, 0.0, text);
                    index += 1;
                }
                UiOpcode::Selectable => {
                    let selected = command.args[0] != 0.0;
                    let response = widget_response(ui, command.id, |ui| {
                        ui.selectable_label(selected, command.text.as_str())
                    });
                    self.store_response(
                        command.id,
                        &response,
                        if response.clicked() { 1.0 } else { 0.0 },
                        String::new(),
                    );
                    index += 1;
                }
                UiOpcode::ProgressBar => {
                    let fraction = finite_f32(command.args[0]).unwrap_or(0.0).clamp(0.0, 1.0);
                    let mut progress = egui::ProgressBar::new(fraction);
                    if !command.text.is_empty() {
                        progress = progress.text(command.text.as_str());
                    }
                    let response = widget_response(ui, command.id, |ui| ui.add(progress));
                    self.store_response(command.id, &response, f64::from(fraction), String::new());
                    index += 1;
                }
                UiOpcode::Image => {
                    if let (Some(handle), Some(width), Some(height)) = (
                        finite_u64(command.args[0]),
                        finite_f32(command.args[1]),
                        finite_f32(command.args[2]),
                    ) {
                        let response = widget_response(ui, command.id, |ui| {
                            ui.add(egui::Image::new((
                                egui::TextureId::User(handle),
                                Vec2::new(width.max(0.0), height.max(0.0)),
                            )))
                        });
                        self.store_response(command.id, &response, handle as f64, String::new());
                    } else {
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
                    index += 1;
                }
                UiOpcode::SetStyle => {
                    let theme = finite_usize(command.args[0]).unwrap_or(0);
                    match theme {
                        1 => ui.ctx().set_visuals(egui::Visuals::light()),
                        0 => ui.ctx().set_visuals(egui::Visuals::dark()),
                        _ => {}
                    }
                    if let Some(font_id) = finite_usize(command.args[1])
                        .and_then(|font_id| self.custom_font_names.get(&(font_id as u32)))
                    {
                        let family = egui::FontFamily::Name(Arc::<str>::from(font_id.as_str()));
                        ui.ctx().all_styles_mut(|style| {
                            for font in style.text_styles.values_mut() {
                                font.family = family.clone();
                            }
                        });
                    }
                    index += 1;
                }
                UiOpcode::LoadFont => {
                    index += 1;
                }
                UiOpcode::RegisterTexture => {
                    if let Some(handle) = finite_u64(command.args[0]) {
                        self.registered_textures.insert(command.id, handle);
                    } else {
                        self.registered_textures.remove(&command.id);
                    }
                    index += 1;
                }
                UiOpcode::MenuItem => {
                    let response =
                        widget_response(ui, command.id, |ui| ui.button(command.text.as_str()));
                    self.store_response(
                        command.id,
                        &response,
                        if response.clicked() { 1.0 } else { 0.0 },
                        String::new(),
                    );
                    index += 1;
                }
                UiOpcode::BeginTabItem
                | UiOpcode::EndWindow
                | UiOpcode::EndPanel
                | UiOpcode::EndHorizontal
                | UiOpcode::EndVertical
                | UiOpcode::EndScrollArea
                | UiOpcode::EndTabBar
                | UiOpcode::EndTabItem
                | UiOpcode::EndCombo
                | UiOpcode::EndCollapsingHeader
                | UiOpcode::EndMenuBar
                | UiOpcode::EndMenu
                | UiOpcode::TreePop
                | UiOpcode::EndTable
                | UiOpcode::TableNextColumn
                | UiOpcode::DemoWindow
                | UiOpcode::MetricsWindow
                | UiOpcode::SetWindowPosition
                | UiOpcode::SetWindowSize
                | UiOpcode::TableNextRow => {
                    if command.opcode == UiOpcode::TableNextRow {
                        ui.end_row();
                    } else if command.opcode == UiOpcode::DemoWindow {
                        egui::Window::new("egui demo")
                            .id(Id::new(("bornengine-ui-demo", command.id)))
                            .show(ui.ctx(), |inner| {
                                inner.label("BornEngine egui controls");
                                inner.label("The demo window is available in every egui build.");
                            });
                    } else if command.opcode == UiOpcode::MetricsWindow {
                        egui::Window::new("egui metrics")
                            .id(Id::new(("bornengine-ui-metrics", command.id)))
                            .show(ui.ctx(), |inner| {
                                inner.label(format!("widgets: {}", self.responses.len()));
                                inner.label(format!(
                                    "shapes: {}",
                                    inner.ctx().cumulative_frame_nr()
                                ));
                            });
                    }
                    index += 1;
                }
                _ => {
                    index += 1;
                }
            }
        }
    }

    fn render_gui(&mut self, ui: &mut Ui, viewport: Rect) {
        let commands = self.gui_commands.to_vec();
        let mut items_by_id: HashMap<u32, Vec<GuiCommand>> = HashMap::new();
        let mut drawings_by_id: HashMap<u32, Vec<GuiCommand>> = HashMap::new();
        let parent_ids: HashMap<u32, u32> = commands
            .iter()
            .filter(|command| command.opcode == GuiOpcode::Control)
            .map(|command| (command.id, gui_parent_id(command)))
            .collect();
        let mut children_by_parent: HashMap<u32, Vec<u32>> = HashMap::new();
        for command in commands
            .iter()
            .filter(|command| command.opcode == GuiOpcode::Control)
        {
            let parent_id = gui_parent_id(command);
            if parent_id != 0 {
                children_by_parent
                    .entry(parent_id)
                    .or_default()
                    .push(command.id);
            }
        }
        let commands_by_id: HashMap<u32, &GuiCommand> = commands
            .iter()
            .filter(|command| command.opcode == GuiOpcode::Control)
            .map(|command| (command.id, command))
            .collect();
        let scroll_content_sizes = gui_scroll_content_sizes(&commands, &parent_ids);
        for command in &commands {
            match command.opcode {
                GuiOpcode::Item => items_by_id
                    .entry(command.id)
                    .or_default()
                    .push(command.clone()),
                GuiOpcode::Drawing => drawings_by_id
                    .entry(command.id)
                    .or_default()
                    .push(command.clone()),
                GuiOpcode::Control => {}
            }
        }
        for command in commands
            .iter()
            .filter(|command| command.opcode == GuiOpcode::Control)
        {
            if command.scratch.len() < 55 {
                continue;
            }
            let kind = finite_usize(command.scratch[0]).unwrap_or(usize::MAX);
            let parent_offset = gui_ancestor_scroll_offset(
                gui_parent_id(command),
                &parent_ids,
                &self.gui_scroll_offsets,
            );
            let Some(x) = finite_f32(command.args[0]) else {
                continue;
            };
            let Some(y) = finite_f32(command.args[1]) else {
                continue;
            };
            let Some(width) = finite_f32(command.args[2]) else {
                continue;
            };
            let Some(height) = finite_f32(command.args[3]) else {
                continue;
            };
            let mut bounds = Rect::from_min_size(
                Pos2::new(x - parent_offset.x, y - parent_offset.y),
                Vec2::new(width.max(0.0), height.max(0.0)),
            );
            if kind == 2 {
                let requested = [bounds.min.x, bounds.min.y, bounds.width(), bounds.height()];
                if self
                    .gui_window_requested_bounds
                    .insert(command.id, requested)
                    .is_some_and(|previous| previous != requested)
                {
                    self.gui_window_bounds.insert(command.id, requested);
                }
                let stored = *self
                    .gui_window_bounds
                    .entry(command.id)
                    .or_insert(requested);
                bounds = Rect::from_min_size(
                    Pos2::new(stored[0], stored[1]),
                    Vec2::new(stored[2], stored[3]),
                );
            }
            if kind != 2 {
                let parent_id = gui_parent_id(command);
                if let (Some(parent_command), Some(siblings)) = (
                    commands_by_id.get(&parent_id).copied().filter(|parent| {
                        finite_usize(parent.scratch.first().copied().unwrap_or(-1.0)) == Some(6)
                    }),
                    children_by_parent.get(&parent_id),
                ) {
                    let parent_bounds = self.gui_control_bounds.get(&parent_id).map(|rect| {
                        Rect::from_min_size(
                            Pos2::new(rect[0] as f32, rect[1] as f32),
                            Vec2::new(rect[2] as f32, rect[3] as f32),
                        )
                    });
                    let child_index = siblings.iter().position(|id| *id == command.id);
                    let columns =
                        finite_usize(gui_values(parent_command).first().copied().unwrap_or(1.0))
                            .unwrap_or(1)
                            .max(1);
                    let rows =
                        finite_usize(gui_values(parent_command).get(1).copied().unwrap_or(1.0))
                            .unwrap_or(1)
                            .max(1);
                    let splitter =
                        finite_f32(gui_values(parent_command).get(2).copied().unwrap_or(4.0))
                            .unwrap_or(4.0)
                            .max(0.0);
                    let padding =
                        finite_f32(parent_command.scratch.get(32).copied().unwrap_or(0.0))
                            .unwrap_or(0.0)
                            .max(0.0);
                    if let (Some(parent_bounds), Some(child_index)) = (parent_bounds, child_index) {
                        let column_weights = self
                            .gui_frame_set_column_weights
                            .get(&parent_id)
                            .cloned()
                            .unwrap_or_else(|| vec![1.0 / columns as f32; columns]);
                        let row_weights = self
                            .gui_frame_set_row_weights
                            .get(&parent_id)
                            .cloned()
                            .unwrap_or_else(|| vec![1.0 / rows as f32; rows]);
                        if let Some(cell) = gui_frame_set_cell_bounds(GuiFrameSetLayout {
                            frame: parent_bounds,
                            padding,
                            splitter,
                            columns,
                            rows,
                            child_index,
                            column_weights: &column_weights,
                            row_weights: &row_weights,
                        }) {
                            bounds = cell;
                        }
                    }
                }
            }
            let clip = gui_control_clip(command, viewport, &parent_ids, &self.gui_scroll_offsets);
            self.gui_control_bounds.insert(
                command.id,
                [
                    bounds.min.x as f64,
                    bounds.min.y as f64,
                    bounds.width() as f64,
                    bounds.height() as f64,
                ],
            );
            self.gui_clip_bounds.insert(
                command.id,
                [
                    clip.min.x as f64,
                    clip.min.y as f64,
                    clip.width() as f64,
                    clip.height() as f64,
                ],
            );

            let normal = gui_profile_color(&command.scratch, 6)
                .linear_multiply(gui_opacity(&command.scratch));
            let _hover = gui_profile_color(&command.scratch, 10)
                .linear_multiply(gui_opacity(&command.scratch));
            let text_color = gui_profile_color(&command.scratch, 18)
                .linear_multiply(gui_opacity(&command.scratch));
            let border_color = gui_profile_color(&command.scratch, 34)
                .linear_multiply(gui_opacity(&command.scratch));
            let text_size = finite_f32(command.scratch[26])
                .unwrap_or(14.0)
                .clamp(1.0, 128.0);
            let bold = command.scratch[27] > 0.5;
            let italic = command.scratch[28] > 0.5;
            let border_width = finite_f32(command.scratch[38]).unwrap_or(0.0).max(0.0);
            let radius = finite_f32(command.scratch[39])
                .unwrap_or(0.0)
                .clamp(0.0, 255.0) as u8;
            self.gui_background_colors
                .insert(command.id, normal.to_array());
            let background_texture = finite_u64(command.scratch[51]).filter(|handle| *handle != 0);
            let current = gui_values(command);

            let painter = ui.painter().with_clip_rect(clip);
            if width > 0.0 && height > 0.0 {
                if let Some(handle) = background_texture {
                    if kind == 4 {
                        painter.rect_filled(bounds, egui::CornerRadius::same(radius), normal);
                        let tile_size = Vec2::new(
                            finite_f32(current.get(1).copied().unwrap_or(0.0)).unwrap_or(0.0),
                            finite_f32(current.get(2).copied().unwrap_or(0.0)).unwrap_or(0.0),
                        );
                        paint_gui_bitmap_border(
                            &painter,
                            handle,
                            bounds,
                            normal,
                            border_width,
                            tile_size,
                            current.first().copied().unwrap_or(0.0) > 0.5,
                        );
                    } else {
                        paint_gui_texture(&painter, handle, bounds, normal, 0.0, 1.0);
                    }
                } else {
                    painter.rect_filled(bounds, egui::CornerRadius::same(radius), normal);
                }
                if border_width > 0.0 && !(kind == 4 && background_texture.is_some()) {
                    painter.rect_stroke(
                        bounds,
                        egui::CornerRadius::same(radius),
                        Stroke::new(border_width, border_color),
                        egui::StrokeKind::Inside,
                    );
                }
                if kind == 2 {
                    let title_height = (text_size + 8.0).clamp(18.0, 32.0).min(bounds.height());
                    let title_bar =
                        Rect::from_min_size(bounds.min, Vec2::new(bounds.width(), title_height));
                    painter.rect_filled(
                        title_bar,
                        egui::CornerRadius::same(radius),
                        gui_profile_color(&command.scratch, 10)
                            .linear_multiply(gui_opacity(&command.scratch)),
                    );
                    painter.text(
                        title_bar.left_center() + Vec2::new(8.0, 0.0),
                        Align2::LEFT_CENTER,
                        command.text.as_str(),
                        egui::FontId::proportional(text_size),
                        text_color,
                    );
                }
            }

            let pointer_position = self.input_snapshot.pointer_position;
            let pointer_inside = pointer_position.is_some_and(|point| {
                point[0] >= bounds.min.x as f64
                    && point[0] <= bounds.max.x as f64
                    && point[1] >= bounds.min.y as f64
                    && point[1] <= bounds.max.y as f64
                    && clip.contains(Pos2::new(point[0] as f32, point[1] as f32))
            });
            let pressed_inside = pointer_inside
                && self
                    .input_snapshot
                    .pointer_buttons
                    .iter()
                    .any(|button| button.pressed && button.button == 0);
            let initial = current.first().copied().unwrap_or(0.0);
            let minimum = current.get(1).copied().unwrap_or(0.0);
            let maximum = current.get(2).copied().unwrap_or(1.0);

            let (response, value, text, scroll_offset) = ui.scope_builder(
                egui::UiBuilder::new().max_rect(bounds).layout(egui::Layout::top_down(egui::Align::Min)),
                |control_ui| {
                    control_ui.set_clip_rect(clip);
                    let items = items_by_id.get(&command.id).map(Vec::as_slice).unwrap_or(&[]);
                    let widget_id = Id::new(("bornengine-retained-gui", command.id));
                    let size = bounds.size();
                    let rich = || {
                        let mut rich = egui::RichText::new(command.text.as_str()).color(text_color).size(text_size);
                        if bold { rich = rich.strong(); }
                        if italic { rich = rich.italics(); }
                        rich
                    };
                    match kind {
                        5 => {
                            let response = control_ui.interact(
                                Rect::from_min_size(bounds.min, Vec2::ZERO),
                                widget_id,
                                egui::Sense::hover(),
                            );
                            (response, initial, String::new(), None)
                        }
                        2 => {
                            let movable = current.first().copied().unwrap_or(1.0) > 0.5;
                            let resizable = current.get(1).copied().unwrap_or(1.0) > 0.5;
                            let closable = current.get(2).copied().unwrap_or(1.0) > 0.5;
                            let title_height = (text_size + 8.0).clamp(18.0, 32.0).min(size.y.max(0.0));
                            let title_bar = Rect::from_min_size(bounds.min, Vec2::new(size.x.max(0.0), title_height));
                            let title_response = control_ui.interact(
                                title_bar,
                                Id::new(("bornengine-retained-window-title", command.id)),
                                if movable { egui::Sense::click_and_drag() } else { egui::Sense::hover() },
                            );
                            let mut response = title_response.clone();
                            if movable && title_response.dragged() {
                                if let Some(window) = self.gui_window_bounds.get_mut(&command.id) {
                                    let delta = title_response.drag_delta();
                                    window[0] += delta.x;
                                    window[1] += delta.y;
                                }
                            }
                            let mut open = true;
                            if closable {
                                let close_size = title_height.clamp(18.0, 24.0);
                                let close_rect = Rect::from_min_size(
                                    Pos2::new(bounds.max.x - close_size - 4.0, bounds.min.y + (title_height - close_size) * 0.5),
                                    Vec2::splat(close_size),
                                );
                                let close_response = control_ui.put(close_rect, egui::Button::new("×"));
                                open = !close_response.clicked();
                                response = response.union(close_response);
                            }
                            if resizable && size.x >= 16.0 && size.y >= 16.0 {
                                let handle = 14.0_f32.min(size.x).min(size.y);
                                let resize_rect = Rect::from_min_size(bounds.max - Vec2::splat(handle), Vec2::splat(handle));
                                let resize_response = control_ui.interact(
                                    resize_rect,
                                    Id::new(("bornengine-retained-window-resize", command.id)),
                                    egui::Sense::drag(),
                                );
                                if resize_response.dragged() {
                                    if let Some(window) = self.gui_window_bounds.get_mut(&command.id) {
                                        let delta = resize_response.drag_delta();
                                        window[2] = (window[2] + delta.x).max(80.0);
                                        window[3] = (window[3] + delta.y).max(60.0);
                                    }
                                }
                                response = response.union(resize_response);
                            }
                            (response.clone(), if open { 1.0 } else { 0.0 }, String::new(), None)
                        }
                        7 => {
                            let response = control_ui.push_id(widget_id, |inner| inner.add_sized(size, egui::Button::new(rich()).fill(normal).stroke(Stroke::new(border_width, border_color)))).inner;
                            (response.clone(), if response.clicked() { 1.0 } else { 0.0 }, String::new(), None)
                        }
                        10 => {
                            let texture_index = if pressed_inside { 2 } else if pointer_inside { 1 } else { 0 };
                            if let Some(handle) = current.get(texture_index).and_then(|value| finite_u64(*value)).filter(|handle| *handle != 0) {
                                paint_gui_texture(&control_ui.painter().with_clip_rect(clip), handle, bounds, normal, 0.0, 1.0);
                                if !command.text.is_empty() {
                                    control_ui.painter().with_clip_rect(clip).text(bounds.center(), Align2::CENTER_CENTER, command.text.as_str(), egui::FontId::proportional(text_size), text_color);
                                }
                                let response = control_ui.interact(bounds, widget_id, egui::Sense::click());
                                (response.clone(), if response.clicked() { 1.0 } else { 0.0 }, String::new(), None)
                            } else {
                                let response = control_ui.push_id(widget_id, |inner| inner.add_sized(size, egui::Button::new(rich()).fill(normal).stroke(Stroke::new(border_width, border_color)))).inner;
                                (response.clone(), if response.clicked() { 1.0 } else { 0.0 }, String::new(), None)
                            }
                        }
                        8 => {
                            let mut checked = initial > 0.5;
                            let response = control_ui.push_id(widget_id, |inner| inner.add_sized(size, egui::Checkbox::new(&mut checked, rich()))).inner;
                            (response, if checked { 1.0 } else { 0.0 }, String::new(), None)
                        }
                        9 => {
                            let response = control_ui.push_id(widget_id, |inner| inner.add_sized(size, egui::RadioButton::new(initial > 0.5, rich()))).inner;
                            (response.clone(), if response.clicked() { 1.0 } else { 0.0 }, String::new(), None)
                        }
                        13..=15 => {
                            let mut edited = command.text.clone();
                            let response = control_ui.push_id(widget_id, |inner| {
                                let mut edit = if kind == 14 { egui::TextEdit::multiline(&mut edited) } else { egui::TextEdit::singleline(&mut edited) };
                                edit = edit.id_salt(("bornengine-retained-text", command.id));
                                let password_index = if kind == 15 { 3 } else { 0 };
                                let numbers_only_index = if kind == 15 { 4 } else { 1 };
                                let max_length_index = if kind == 15 { 5 } else { 2 };
                                if current.get(password_index).copied().unwrap_or(0.0) > 0.5 && matches!(kind, 13 | 15) { edit = edit.password(true); }
                                let max_length = finite_usize(current.get(max_length_index).copied().unwrap_or(0.0)).unwrap_or(0);
                                if max_length > 0
                                    && current.get(numbers_only_index).copied().unwrap_or(0.0) <= 0.5
                                {
                                    edit = edit.char_limit(max_length);
                                }
                                inner.add_sized(size, edit)
                            }).inner;
                            (response, initial, edited, None)
                        }
                        16 => {
                            let mut slider_value = initial.clamp(minimum.min(maximum), maximum.max(minimum));
                            let response = control_ui.push_id(widget_id, |inner| inner.add_sized(size, egui::Slider::new(&mut slider_value, ordered_range(minimum, maximum)).text(command.text.as_str()))).inner;
                            (response, slider_value, String::new(), None)
                        }
                        17 => {
                            let mut selected = finite_usize(current.get(1).copied().unwrap_or(-1.0))
                                .filter(|index| *index < items.len());
                            let selected_label = selected
                                .and_then(|index| items.get(index))
                                .map_or("Select…", |item| item.text.as_str());
                            let response = control_ui.push_id(widget_id, |inner| {
                                egui::ComboBox::from_id_salt(("bornengine-retained-popup", command.id))
                                    .selected_text(selected_label)
                                    .width(size.x.max(0.0))
                                    .show_ui(inner, |popup| {
                                        for item in items {
                                            let index = finite_usize(item.args[0]).unwrap_or(0);
                                            if popup.selectable_label(selected == Some(index), item.text.as_str()).clicked() {
                                                selected = Some(index);
                                            }
                                        }
                                    })
                                    .response
                            }).inner;
                            (response, selected.map_or(-1.0, |index| index as f64), String::new(), None)
                        }
                        18 => {
                            let mut edited = command.text.clone();
                            let mut selected = finite_usize(current.get(1).copied().unwrap_or(-1.0))
                                .filter(|index| *index < items.len());
                            let selected_label = selected
                                .and_then(|index| items.get(index))
                                .map_or("Select…", |item| item.text.as_str())
                                .to_owned();
                            let (text_response, _popup_response) = control_ui.push_id(widget_id, |inner| {
                                inner.horizontal(|row| {
                                    let combo_width = size.y.min(size.x).max(0.0);
                                    let input_width = (size.x - combo_width).max(0.0);
                                    let edit_response = row.add_sized(
                                        [input_width, size.y],
                                        egui::TextEdit::singleline(&mut edited)
                                            .id_salt(("bornengine-retained-popup-edit", command.id)),
                                    );
                                    let popup_response = egui::ComboBox::from_id_salt(("bornengine-retained-popup-edit-items", command.id))
                                        .selected_text(selected_label)
                                        .width(combo_width)
                                        .show_ui(row, |popup| {
                                            for item in items {
                                                let index = finite_usize(item.args[0]).unwrap_or(0);
                                                if popup.selectable_label(selected == Some(index), item.text.as_str()).clicked() {
                                                    selected = Some(index);
                                                }
                                            }
                                        })
                                        .response;
                                    (edit_response, popup_response)
                                }).inner
                            }).inner;
                            (text_response, selected.map_or(-1.0, |index| index as f64), edited, None)
                        }
                        26 => {
                            let fraction = initial.clamp(0.0, 1.0) as f32;
                            let response = control_ui.push_id(widget_id, |inner| inner.add_sized(size, egui::ProgressBar::new(fraction))).inner;
                            (response, fraction as f64, String::new(), None)
                        }
                        3 => {
                            let horizontal_mode = current.first().copied().unwrap_or(0.0);
                            let vertical_mode = current.get(1).copied().unwrap_or(0.0);
                            let horizontal = horizontal_mode != 2.0;
                            let vertical = vertical_mode != 2.0;
                            let visibility = if horizontal_mode == 1.0 || vertical_mode == 1.0 {
                                egui::containers::scroll_area::ScrollBarVisibility::AlwaysVisible
                            } else if !horizontal && !vertical {
                                egui::containers::scroll_area::ScrollBarVisibility::AlwaysHidden
                            } else {
                                egui::containers::scroll_area::ScrollBarVisibility::VisibleWhenNeeded
                            };
                            let area = match (horizontal, vertical) {
                                (true, true) => egui::ScrollArea::both(),
                                (true, false) => egui::ScrollArea::horizontal(),
                                (false, true) => egui::ScrollArea::vertical(),
                                (false, false) => egui::ScrollArea::neither(),
                            }
                            .id_salt(("bornengine-retained-scroll", command.id))
                            .max_width(size.x.max(0.0))
                            .max_height(size.y.max(0.0))
                            .auto_shrink([false, false])
                            .scroll_bar_visibility(visibility);
                            let content_size = scroll_content_sizes.get(&command.id).copied().unwrap_or(size);
                            let output = area.show(control_ui, |inner| { inner.allocate_space(content_size); });
                            let response = control_ui.interact(bounds, widget_id, egui::Sense::hover());
                            (response, 0.0, String::new(), Some(output.state.offset))
                        }
                        6 => {
                            let columns = finite_usize(current.first().copied().unwrap_or(1.0)).unwrap_or(1).max(1);
                            let rows = finite_usize(current.get(1).copied().unwrap_or(1.0)).unwrap_or(1).max(1);
                            let splitter = finite_f32(current.get(2).copied().unwrap_or(4.0)).unwrap_or(4.0).max(0.0);
                            let padding = finite_f32(command.scratch.get(32).copied().unwrap_or(0.0)).unwrap_or(0.0).max(0.0);
                            let content = bounds.shrink(padding);
                            let available_x = (content.width() - splitter * columns.saturating_sub(1) as f32).max(1.0);
                            let available_y = (content.height() - splitter * rows.saturating_sub(1) as f32).max(1.0);
                            let column_weights = self.gui_frame_set_column_weights.entry(command.id)
                                .or_insert_with(|| vec![1.0 / columns as f32; columns]);
                            if column_weights.len() != columns { *column_weights = vec![1.0 / columns as f32; columns]; }
                            let row_weights = self.gui_frame_set_row_weights.entry(command.id)
                                .or_insert_with(|| vec![1.0 / rows as f32; rows]);
                            if row_weights.len() != rows { *row_weights = vec![1.0 / rows as f32; rows]; }
                            let mut response = control_ui.interact(bounds, widget_id, egui::Sense::hover());
                            for split_index in 0..columns.saturating_sub(1) {
                                let fraction: f32 = column_weights.iter().take(split_index + 1).sum();
                                let center_x = content.min.x + available_x * fraction + splitter * split_index as f32 + splitter * 0.5;
                                let hit_width = (splitter + 10.0).max(12.0);
                                let hit_rect = Rect::from_center_size(Pos2::new(center_x, content.center().y), Vec2::new(hit_width, content.height()));
                                let split_response = control_ui.interact(hit_rect, Id::new(("bornengine-frame-column", command.id, split_index)), egui::Sense::drag());
                                if split_response.dragged() {
                                    let pair_total = column_weights[split_index] + column_weights[split_index + 1];
                                    let minimum = 0.05_f32.min(pair_total * 0.5);
                                    let next = (column_weights[split_index] + split_response.drag_delta().x / available_x)
                                        .clamp(minimum, pair_total - minimum);
                                    column_weights[split_index] = next;
                                    column_weights[split_index + 1] = pair_total - next;
                                }
                                response = response.union(split_response);
                            }
                            for split_index in 0..rows.saturating_sub(1) {
                                let fraction: f32 = row_weights.iter().take(split_index + 1).sum();
                                let center_y = content.min.y + available_y * fraction + splitter * split_index as f32 + splitter * 0.5;
                                let hit_height = (splitter + 10.0).max(12.0);
                                let hit_rect = Rect::from_center_size(Pos2::new(content.center().x, center_y), Vec2::new(content.width(), hit_height));
                                let split_response = control_ui.interact(hit_rect, Id::new(("bornengine-frame-row", command.id, split_index)), egui::Sense::drag());
                                if split_response.dragged() {
                                    let pair_total = row_weights[split_index] + row_weights[split_index + 1];
                                    let minimum = 0.05_f32.min(pair_total * 0.5);
                                    let next = (row_weights[split_index] + split_response.drag_delta().y / available_y)
                                        .clamp(minimum, pair_total - minimum);
                                    row_weights[split_index] = next;
                                    row_weights[split_index + 1] = pair_total - next;
                                }
                                response = response.union(split_response);
                            }
                            let painter = control_ui.painter().with_clip_rect(clip);
                            let mut fraction = 0.0;
                            for (index, weight) in column_weights.iter().enumerate().take(columns.saturating_sub(1)) {
                                fraction += *weight;
                                let x = content.min.x + available_x * fraction + splitter * index as f32 + splitter * 0.5;
                                painter.line_segment([Pos2::new(x, content.min.y), Pos2::new(x, content.max.y)], Stroke::new(splitter.max(1.0), border_color));
                            }
                            fraction = 0.0;
                            for (index, weight) in row_weights.iter().enumerate().take(rows.saturating_sub(1)) {
                                fraction += *weight;
                                let y = content.min.y + available_y * fraction + splitter * index as f32 + splitter * 0.5;
                                painter.line_segment([Pos2::new(content.min.x, y), Pos2::new(content.max.x, y)], Stroke::new(splitter.max(1.0), border_color));
                            }
                            (response, 0.0, String::new(), None)
                        }
                        19 | 20 | 23 => {
                            let mut selected = finite_usize(current.get(1).copied().unwrap_or(-1.0))
                                .filter(|index| *index < items.len());
                            let response = control_ui.push_id(widget_id, |inner| {
                                let mut result = inner.interact(bounds, widget_id, egui::Sense::hover());
                                let _ = inner.vertical(|rows| {
                                    for item in items {
                                        let index = finite_usize(item.args[0]).unwrap_or(0);
                                        let depth = finite_f32(item.args[2]).unwrap_or(0.0).max(0.0);
                                        if kind == 19 { rows.add_space(depth * 12.0); }
                                        let row = rows.selectable_label(selected == Some(index), item.text.as_str());
                                        if row.clicked() {
                                            selected = Some(index);
                                            result = row.clone();
                                        } else if row.hovered() {
                                            result = row.clone();
                                        }
                                    }
                                });
                                result
                            }).inner;
                            (response, selected.map_or(-1.0, |index| index as f64), String::new(), None)
                        }
                        21 | 22 => {
                            let mut selected = finite_usize(current.get(1).copied().unwrap_or(-1.0))
                                .filter(|index| *index < items.len());
                            let response = control_ui.push_id(widget_id, |inner| {
                                let mut result = None;
                                if !items.is_empty() {
                                    let item_width = size.x.max(0.0) / items.len() as f32;
                                    let item_height = if kind == 21 { 28.0_f32.min(size.y.max(0.0)) } else { size.y.max(0.0) };
                                    for (item_index, item) in items.iter().enumerate() {
                                        let index = finite_usize(item.args[0]).unwrap_or(item_index);
                                        let item_rect = Rect::from_min_size(
                                            Pos2::new(bounds.min.x + item_width * item_index as f32, bounds.min.y),
                                            Vec2::new(item_width, item_height),
                                        );
                                        let item_response = inner.interact(
                                            item_rect,
                                            Id::new(("bornengine-retained-tab-menu-item", command.id, item_index)),
                                            egui::Sense::click(),
                                        );
                                        let item_painter = inner.painter().with_clip_rect(clip);
                                        let fill = if selected == Some(index) {
                                            gui_profile_color(&command.scratch, 22).linear_multiply(gui_opacity(&command.scratch))
                                        } else if item_response.hovered() {
                                            gui_profile_color(&command.scratch, 10).linear_multiply(gui_opacity(&command.scratch))
                                        } else {
                                            normal
                                        };
                                        item_painter.rect_filled(item_rect, egui::CornerRadius::same(radius), fill);
                                        item_painter.text(
                                            item_rect.center(),
                                            Align2::CENTER_CENTER,
                                            item.text.as_str(),
                                            egui::FontId::proportional(text_size),
                                            text_color,
                                        );
                                        if item_response.clicked() {
                                            selected = Some(index);
                                            result = Some(item_response);
                                        } else if item_response.hovered() {
                                            result = Some(item_response);
                                        }
                                    }
                                }
                                result.unwrap_or_else(|| inner.interact(bounds, widget_id, egui::Sense::hover()))
                            }).inner;
                            (response, selected.map_or(-1.0, |index| index as f64), String::new(), None)
                        }
                        11 | 12 => {
                            let label = egui::Label::new(rich()).wrap();
                            let response = control_ui.push_id(widget_id, |inner| inner.add_sized(size, label)).inner;
                            (response, initial, String::new(), None)
                        }
                        24 | 25 => {
                            if let Some(handle) = current.get(7).and_then(|value| finite_u64(*value)).filter(|handle| *handle != 0) {
                                let tint = gui_profile_color(current, 3).linear_multiply(finite_f32(current.first().copied().unwrap_or(1.0)).unwrap_or(1.0).clamp(0.0, 1.0));
                                let rotation = finite_f32(current.get(1).copied().unwrap_or(0.0)).unwrap_or(0.0);
                                let zoom = finite_f32(current.get(2).copied().unwrap_or(1.0)).unwrap_or(1.0).clamp(0.01, 1024.0);
                                paint_gui_texture(&control_ui.painter().with_clip_rect(clip), handle, bounds, tint, rotation, zoom);
                            }
                            let response = control_ui.interact(bounds, widget_id, egui::Sense::hover());
                            (response, initial, String::new(), None)
                        }
                        _ => {
                            let response = control_ui.interact(bounds, widget_id, egui::Sense::click_and_drag());
                            if !command.text.is_empty() { control_ui.label(rich()); }
                            (response, initial, String::new(), None)
                        }
                    }
                },
            ).inner;

            let popup_edit_inside = kind == 18
                && pointer_position.is_some_and(|point| {
                    point[0] < bounds.min.x as f64 + (width - height).max(0.0) as f64
                });
            let request_text_focus =
                pressed_inside && (matches!(kind, 13..=15) || popup_edit_inside);
            let native_focus_request = gui_focus_request(current);
            if native_focus_request == Some(1.0) {
                response.request_focus();
            } else if native_focus_request == Some(2.0) {
                response.surrender_focus();
            }
            if request_text_focus {
                response.request_focus();
            }
            let requested_focus = request_text_focus || native_focus_request == Some(1.0);
            self.text_edit_focused |= requested_focus || response.has_focus();
            let mut value = value;
            let mut text = text;
            let native_selection_changed = matches!(kind, 17..=23)
                && (value - current.get(1).copied().unwrap_or(-1.0)).abs() > f64::EPSILON;
            let mut forced_change = native_selection_changed;
            if matches!(kind, 13..=15) {
                let (numbers_only_index, max_length_index) =
                    if kind == 15 { (4, 5) } else { (1, 2) };
                let numbers_only = current.get(numbers_only_index).copied().unwrap_or(0.0) > 0.5;
                let max_length =
                    finite_usize(current.get(max_length_index).copied().unwrap_or(0.0))
                        .unwrap_or(0);
                if numbers_only {
                    let filtered = text
                        .chars()
                        .filter(|character| {
                            character.is_ascii_digit() || matches!(character, '+' | '-' | '.')
                        })
                        .collect::<String>();
                    text = if max_length > 0 {
                        filtered.chars().take(max_length).collect()
                    } else {
                        filtered
                    };
                }
                if kind == 15 {
                    value = text
                        .parse::<f64>()
                        .ok()
                        .filter(|number| number.is_finite())
                        .map(|number| number.clamp(minimum.min(maximum), maximum.max(minimum)))
                        .unwrap_or(initial);
                    forced_change = (value - initial).abs() > f64::EPSILON;
                }
            }

            let response_value = value;
            if kind == 2 {
                if let Some(stored) = self.gui_window_bounds.get(&command.id).copied() {
                    bounds = Rect::from_min_size(
                        Pos2::new(stored[0], stored[1]),
                        Vec2::new(stored[2], stored[3]),
                    );
                    self.gui_control_bounds.insert(
                        command.id,
                        [
                            stored[0] as f64,
                            stored[1] as f64,
                            stored[2] as f64,
                            stored[3] as f64,
                        ],
                    );
                }
            }
            self.gui_responses.insert(
                command.id,
                GuiResponse {
                    clicked: response.clicked() || native_selection_changed,
                    changed: response.changed() || forced_change,
                    hovered: response.hovered(),
                    focused: response.has_focus() || request_text_focus,
                    dragged: response.dragged(),
                    value: response_value,
                    text,
                    rect: [
                        bounds.min.x as f64,
                        bounds.min.y as f64,
                        bounds.width() as f64,
                        bounds.height() as f64,
                    ],
                },
            );
            if let Some(offset) = scroll_offset {
                self.gui_scroll_offsets
                    .insert(command.id, [offset.x, offset.y]);
            }
            if kind == 27 {
                if let Some(drawings) = drawings_by_id.get(&command.id) {
                    for drawing in drawings {
                        let mut drawing = drawing.clone();
                        drawing.args[2] -= parent_offset.x as f64;
                        drawing.args[3] -= parent_offset.y as f64;
                        if drawing.scratch.len() >= 7 {
                            drawing.scratch[3] -= parent_offset.x as f64;
                            drawing.scratch[4] -= parent_offset.y as f64;
                        }
                        paint_gui_drawing(ui, viewport, bounds, clip, &drawing);
                    }
                }
            }
            self.capture_gui_interaction(
                command.id,
                &response,
                bounds,
                requested_focus,
                response.clicked() || native_selection_changed,
            );
        }
    }

    fn capture_gui_interaction(
        &mut self,
        id: u32,
        response: &egui::Response,
        bounds: Rect,
        requested_focus: bool,
        action: bool,
    ) {
        let hovered = response.hovered();
        let focused = response.has_focus() || requested_focus;
        let local_scale = gui_ancestor_stretch_scale(id, self.gui_commands);
        if hovered {
            self.gui_hovered.insert(id);
        }
        if hovered || requested_focus {
            self.gui_wants_pointer_input = true;
        }
        if focused {
            self.gui_focused.insert(id);
            self.gui_wants_keyboard_input = true;
        }
        let pointer = self
            .input_snapshot
            .pointer_position
            .filter(|point| point[0].is_finite() && point[1].is_finite());
        let modifiers = (self.input_snapshot.modifiers.shift as u32)
            | ((self.input_snapshot.modifiers.ctrl as u32) << 1)
            | ((self.input_snapshot.modifiers.alt as u32) << 2)
            | ((self.input_snapshot.modifiers.super_key as u32) << 3);
        if hovered && !self.previous_gui_hovered.contains(&id) {
            self.gui_events.push(make_gui_event_for_control(
                GuiEventType::PointerEnter,
                id,
                pointer,
                bounds,
                modifiers,
                local_scale,
            ));
        }
        if !hovered && self.previous_gui_hovered.contains(&id) {
            self.gui_events.push(make_gui_event_for_control(
                GuiEventType::PointerLeave,
                id,
                pointer,
                bounds,
                modifiers,
                local_scale,
            ));
        }
        if focused && !self.previous_gui_focused.contains(&id) {
            self.gui_events.push(make_gui_event_for_control(
                GuiEventType::Focus,
                id,
                pointer,
                bounds,
                modifiers,
                local_scale,
            ));
        }
        if !focused && self.previous_gui_focused.contains(&id) {
            self.gui_events.push(make_gui_event_for_control(
                GuiEventType::Blur,
                id,
                pointer,
                bounds,
                modifiers,
                local_scale,
            ));
        }
        if hovered
            && (self.input_snapshot.pointer_delta[0] != 0.0
                || self.input_snapshot.pointer_delta[1] != 0.0)
        {
            self.gui_events.push(make_gui_event_for_control(
                GuiEventType::PointerMove,
                id,
                pointer,
                bounds,
                modifiers,
                local_scale,
            ));
        }
        if hovered && (self.input_snapshot.scroll_x != 0.0 || self.input_snapshot.scroll_y != 0.0) {
            let mut event = make_gui_event_for_control(
                GuiEventType::Wheel,
                id,
                pointer,
                bounds,
                modifiers,
                local_scale,
            );
            event.wheel_x = self.input_snapshot.scroll_x;
            event.wheel_y = self.input_snapshot.scroll_y;
            self.gui_events.push(event);
        }
        if response.dragged() {
            self.gui_events.push(make_gui_event_for_control(
                GuiEventType::PointerDrag,
                id,
                pointer,
                bounds,
                modifiers,
                local_scale,
            ));
        }
        if action {
            self.gui_events.push(make_gui_event_for_control(
                GuiEventType::Action,
                id,
                pointer,
                bounds,
                modifiers,
                local_scale,
            ));
        }
        if response.changed() {
            self.gui_events.push(make_gui_event_for_control(
                GuiEventType::Change,
                id,
                pointer,
                bounds,
                modifiers,
                local_scale,
            ));
        }
        if hovered {
            for button in &self.input_snapshot.pointer_buttons {
                let mut event = make_gui_event_for_control(
                    if button.pressed {
                        GuiEventType::PointerDown
                    } else {
                        GuiEventType::PointerUp
                    },
                    id,
                    pointer,
                    bounds,
                    modifiers,
                    local_scale,
                );
                event.button = button.button as f64;
                self.gui_events.push(event);
            }
        }
        if focused {
            for input in self.input_snapshot.ordered_key_text_events() {
                if let UiInputEvent::Key(key) = input {
                    let mut event = make_gui_event_for_control(
                        if key.pressed {
                            GuiEventType::KeyDown
                        } else {
                            GuiEventType::KeyUp
                        },
                        id,
                        pointer,
                        bounds,
                        modifiers,
                        local_scale,
                    );
                    event.key = key.key as f64;
                    self.gui_events.push(event);
                }
            }
        }
    }

    fn render_tab_bar(&mut self, ui: &mut Ui, start: usize, end: usize, id: u32) {
        let mut tab_items = Vec::new();
        let mut cursor = start + 1;
        while cursor < end {
            if self.commands[cursor].opcode == UiOpcode::BeginTabItem {
                if let Some(close) = self
                    .pairs
                    .get(&cursor)
                    .copied()
                    .filter(|close| *close < end)
                {
                    tab_items.push((cursor, close));
                    cursor = close + 1;
                    continue;
                }
            }
            if let Some(close) = self
                .pairs
                .get(&cursor)
                .copied()
                .filter(|close| *close < end)
            {
                cursor = close + 1;
            } else {
                cursor += 1;
            }
        }
        if tab_items.is_empty() {
            return;
        }

        let current = self
            .active_tabs
            .entry(id)
            .or_insert(self.commands[tab_items[0].0].id);
        let mut selected = *current;
        ui.horizontal(|ui| {
            for (item_start, _) in &tab_items {
                let command = &self.commands[*item_start];
                let response = widget_response(ui, command.id, |ui| {
                    ui.selectable_label(selected == command.id, command.text.as_str())
                });
                self.store_response(
                    command.id,
                    &response,
                    if selected == command.id { 1.0 } else { 0.0 },
                    String::new(),
                );
                if response.clicked() {
                    selected = command.id;
                }
            }
        });
        self.active_tabs.insert(id, selected);
        if let Some((item_start, item_end)) = tab_items
            .iter()
            .copied()
            .find(|(item_start, _)| self.commands[*item_start].id == selected)
        {
            ui.separator();
            self.render_range(ui, item_start + 1, item_end);
        }
    }

    fn paint(&mut self, ui: &mut Ui, command: &UiCommand) {
        let origin = ui.min_rect().min;
        let values = &command.scratch;
        let default_color = Color32::WHITE;
        let coordinate = |index: usize| finite_f32(values.get(index).copied().unwrap_or(f64::NAN));
        let color = |start: usize| {
            if values.len() >= start + 4 {
                color_from_f64(
                    values[start],
                    values[start + 1],
                    values[start + 2],
                    values[start + 3],
                )
            } else {
                default_color
            }
        };
        match command.opcode {
            UiOpcode::PaintLine if values.len() >= 4 => {
                if let (Some(x1), Some(y1), Some(x2), Some(y2)) =
                    (coordinate(0), coordinate(1), coordinate(2), coordinate(3))
                {
                    let stroke = Stroke::new(
                        finite_f32(values.get(8).copied().unwrap_or(1.0))
                            .unwrap_or(1.0)
                            .max(0.1),
                        color(4),
                    );
                    ui.painter().line_segment(
                        [origin + Vec2::new(x1, y1), origin + Vec2::new(x2, y2)],
                        stroke,
                    );
                }
            }
            UiOpcode::PaintRect if values.len() >= 4 => {
                if let (Some(x), Some(y), Some(width), Some(height)) =
                    (coordinate(0), coordinate(1), coordinate(2), coordinate(3))
                {
                    let rect = Rect::from_min_size(
                        origin + Vec2::new(x, y),
                        Vec2::new(width.max(0.0), height.max(0.0)),
                    );
                    ui.painter()
                        .rect_filled(rect, egui::CornerRadius::ZERO, color(4));
                }
            }
            UiOpcode::PaintCircle if values.len() >= 3 => {
                if let (Some(x), Some(y), Some(radius)) =
                    (coordinate(0), coordinate(1), coordinate(2))
                {
                    let stroke = Stroke::new(
                        finite_f32(values.get(7).copied().unwrap_or(1.0))
                            .unwrap_or(1.0)
                            .max(0.1),
                        color(3),
                    );
                    ui.painter()
                        .circle_stroke(origin + Vec2::new(x, y), radius.max(0.0), stroke);
                }
            }
            UiOpcode::PaintText => {
                if let (Some(x), Some(y)) = (coordinate(0), coordinate(1)) {
                    let size = finite_f32(values.get(2).copied().unwrap_or(16.0))
                        .unwrap_or(16.0)
                        .max(1.0);
                    ui.painter().text(
                        origin + Vec2::new(x, y),
                        Align2::LEFT_TOP,
                        command.text.as_str(),
                        egui::FontId::proportional(size),
                        color(3),
                    );
                }
            }
            UiOpcode::PaintPolyline | UiOpcode::PaintPolygon => {
                let coordinate_count = values.len().saturating_sub(5) & !1;
                let points: Vec<_> = values[..coordinate_count]
                    .as_chunks::<2>()
                    .0
                    .iter()
                    .filter_map(|point| {
                        Some(origin + Vec2::new(finite_f32(point[0])?, finite_f32(point[1])?))
                    })
                    .collect();
                if points.len() >= 2 {
                    let stroke = Stroke::new(
                        finite_f32(values.get(coordinate_count + 4).copied().unwrap_or(1.0))
                            .unwrap_or(1.0)
                            .max(0.1),
                        color(coordinate_count),
                    );
                    if command.opcode == UiOpcode::PaintPolygon {
                        ui.painter().add(Shape::convex_polygon(
                            points,
                            Color32::TRANSPARENT,
                            stroke,
                        ));
                    } else {
                        ui.painter().line(points, stroke);
                    }
                }
            }
            _ => {}
        }
    }

    fn store_response(&mut self, id: u32, response: &egui::Response, value: f64, text: String) {
        self.responses.insert(
            id,
            UiResponse {
                clicked: response.clicked(),
                changed: response.changed(),
                hovered: response.hovered(),
                focused: response.has_focus(),
                dragged: response.dragged(),
                value,
                text,
            },
        );
    }
}

include!("egui_gui_helpers.rs");

#[cfg(test)]
#[path = "egui_tests.rs"]
mod tests;
