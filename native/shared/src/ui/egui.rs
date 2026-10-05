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
            let bounds = Rect::from_min_size(
                Pos2::new(x - parent_offset.x, y - parent_offset.y),
                Vec2::new(width.max(0.0), height.max(0.0)),
            );
            let clip = gui_control_clip(command, viewport, &parent_ids, &self.gui_scroll_offsets);
            self.gui_control_bounds.insert(
                command.id,
                [
                    bounds.min.x as f64,
                    bounds.min.y as f64,
                    width as f64,
                    height as f64,
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

            let painter = ui.painter().with_clip_rect(clip);
            if width > 0.0 && height > 0.0 {
                if let Some(handle) = background_texture {
                    paint_gui_texture(&painter, handle, bounds, normal, 0.0, 1.0);
                } else {
                    painter.rect_filled(bounds, egui::CornerRadius::same(radius), normal);
                }
                if border_width > 0.0 {
                    painter.rect_stroke(
                        bounds,
                        egui::CornerRadius::same(radius),
                        Stroke::new(border_width, border_color),
                        egui::StrokeKind::Inside,
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
            let current = gui_values(command);
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
                        13 | 14 | 15 => {
                            let mut edited = command.text.clone();
                            let response = control_ui.push_id(widget_id, |inner| {
                                let mut edit = if kind == 14 { egui::TextEdit::multiline(&mut edited) } else { egui::TextEdit::singleline(&mut edited) };
                                edit = edit.id_salt(("bornengine-retained-text", command.id));
                                if current.get(0).copied().unwrap_or(0.0) > 0.5 && kind == 13 { edit = edit.password(true); }
                                let max_length = finite_usize(current.get(2).copied().unwrap_or(0.0)).unwrap_or(0);
                                if max_length > 0 { edit = edit.char_limit(max_length); }
                                inner.add_sized(size, edit)
                            }).inner;
                            (response, initial, edited, None)
                        }
                        16 => {
                            let mut slider_value = initial.clamp(minimum.min(maximum), maximum.max(minimum));
                            let response = control_ui.push_id(widget_id, |inner| inner.add_sized(size, egui::Slider::new(&mut slider_value, ordered_range(minimum, maximum)).text(command.text.as_str()))).inner;
                            (response, slider_value, String::new(), None)
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
                        17 | 18 | 19 | 20 | 21 | 22 | 23 => {
                            let mut selected = finite_usize(current.get(1).copied().unwrap_or(-1.0))
                                .filter(|index| *index < items.len());
                            let response = control_ui.push_id(widget_id, |inner| {
                                let mut last = inner.interact(bounds, widget_id, egui::Sense::hover());
                                let _ = inner.vertical(|rows| {
                                    for item in items {
                                        let index = finite_usize(item.args[0]).unwrap_or(0);
                                        let depth = finite_f32(item.args[2]).unwrap_or(0.0).max(0.0);
                                        if kind == 19 { rows.add_space(depth * 12.0); }
                                        let row = rows.selectable_label(selected == Some(index), item.text.as_str());
                                        let hit = pointer_position.is_some_and(|point| row.rect.contains(Pos2::new(point[0] as f32, point[1] as f32))) && pressed_inside;
                                        if row.clicked() || hit { selected = Some(index); }
                                        last = row;
                                    }
                                });
                                last
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

            let request_text_focus = pressed_inside && matches!(kind, 13 | 14 | 15);
            if request_text_focus {
                response.request_focus();
            }
            let mut value = value;
            let text = text;
            let mut forced_change = false;
            if pressed_inside {
                match kind {
                    7 | 10 | 22 | 23 => value = 1.0,
                    8 => {
                        value = if initial > 0.5 { 0.0 } else { 1.0 };
                        forced_change = true;
                    }
                    9 => {
                        value = 1.0;
                        forced_change = initial <= 0.5;
                    }
                    16 => {
                        if let Some([pointer_x, _]) = pointer_position {
                            let amount = ((pointer_x - bounds.min.x as f64)
                                / (width as f64).max(1.0))
                            .clamp(0.0, 1.0);
                            value = minimum + (maximum - minimum) * amount;
                            forced_change = (value - initial).abs() > f64::EPSILON;
                        }
                    }
                    _ => {}
                }
            }

            let response_value = if kind == 16
                || kind == 15
                || kind == 8
                || kind == 9
                || kind == 17
                || kind == 18
                || kind == 19
                || kind == 20
                || kind == 21
                || kind == 26
            {
                value
            } else {
                value
            };
            self.gui_responses.insert(
                command.id,
                GuiResponse {
                    clicked: response.clicked() || pressed_inside,
                    changed: response.changed() || forced_change,
                    hovered: response.hovered() || pointer_inside,
                    focused: response.has_focus() || request_text_focus,
                    dragged: response.dragged(),
                    value: response_value,
                    text,
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
                pointer_inside,
                pressed_inside,
                request_text_focus,
            );
        }
    }

    fn capture_gui_interaction(
        &mut self,
        id: u32,
        response: &egui::Response,
        bounds: Rect,
        pointer_inside: bool,
        pressed_inside: bool,
        requested_focus: bool,
    ) {
        let hovered = response.hovered() || pointer_inside;
        let focused = response.has_focus() || requested_focus;
        if hovered {
            self.gui_hovered.insert(id);
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
            self.gui_events.push(make_gui_event(
                GuiEventType::PointerEnter,
                id,
                pointer,
                bounds,
                modifiers,
            ));
        }
        if !hovered && self.previous_gui_hovered.contains(&id) {
            self.gui_events.push(make_gui_event(
                GuiEventType::PointerLeave,
                id,
                pointer,
                bounds,
                modifiers,
            ));
        }
        if focused && !self.previous_gui_focused.contains(&id) {
            self.gui_events.push(make_gui_event(
                GuiEventType::Focus,
                id,
                pointer,
                bounds,
                modifiers,
            ));
        }
        if !focused && self.previous_gui_focused.contains(&id) {
            self.gui_events.push(make_gui_event(
                GuiEventType::Blur,
                id,
                pointer,
                bounds,
                modifiers,
            ));
        }
        if hovered
            && (self.input_snapshot.pointer_delta[0] != 0.0
                || self.input_snapshot.pointer_delta[1] != 0.0)
        {
            self.gui_events.push(make_gui_event(
                GuiEventType::PointerMove,
                id,
                pointer,
                bounds,
                modifiers,
            ));
        }
        if hovered && (self.input_snapshot.scroll_x != 0.0 || self.input_snapshot.scroll_y != 0.0) {
            let mut event = make_gui_event(GuiEventType::Wheel, id, pointer, bounds, modifiers);
            event.wheel_x = self.input_snapshot.scroll_x;
            event.wheel_y = self.input_snapshot.scroll_y;
            self.gui_events.push(event);
        }
        if response.dragged() {
            self.gui_events.push(make_gui_event(
                GuiEventType::PointerDrag,
                id,
                pointer,
                bounds,
                modifiers,
            ));
        }
        if response.clicked() || pressed_inside {
            self.gui_events.push(make_gui_event(
                GuiEventType::Action,
                id,
                pointer,
                bounds,
                modifiers,
            ));
        }
        if response.changed() {
            self.gui_events.push(make_gui_event(
                GuiEventType::Change,
                id,
                pointer,
                bounds,
                modifiers,
            ));
        }
        if hovered {
            for button in &self.input_snapshot.pointer_buttons {
                let mut event = make_gui_event(
                    if button.pressed {
                        GuiEventType::PointerDown
                    } else {
                        GuiEventType::PointerUp
                    },
                    id,
                    pointer,
                    bounds,
                    modifiers,
                );
                event.button = button.button as f64;
                self.gui_events.push(event);
            }
        }
        if focused {
            for input in self.input_snapshot.ordered_key_text_events() {
                if let UiInputEvent::Key(key) = input {
                    let mut event = make_gui_event(
                        if key.pressed {
                            GuiEventType::KeyDown
                        } else {
                            GuiEventType::KeyUp
                        },
                        id,
                        pointer,
                        bounds,
                        modifiers,
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

fn gui_values_range(command: &GuiCommand) -> Option<(usize, usize)> {
    if command.scratch.len() < 55 {
        return None;
    }
    let clip_count = finite_usize(command.scratch[53])?.min((command.scratch.len() - 54) / 5);
    let count_index = 54 + clip_count * 5;
    let values_start = count_index + 1;
    (values_start <= command.scratch.len()).then_some((count_index, values_start))
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
#[cfg(test)]
mod tests {
    use super::color_channel;
    use crate::gui::{GuiCommand, GuiOpcode};
    use crate::ui::{
        EguiUi, UiBackend, UiCommand, UiInputEvent, UiInputSnapshot, UiKeyEvent, UiOpcode,
        UiPointerButtonEvent,
    };
    use std::collections::HashSet;

    fn retained(kind: f64, id: u32, rect: [f64; 4], text: &str, values: &[f64]) -> GuiCommand {
        retained_with_parent(kind, id, 0, rect, text, values)
    }

    fn retained_with_parent(
        kind: f64,
        id: u32,
        parent_id: u32,
        rect: [f64; 4],
        text: &str,
        values: &[f64],
    ) -> GuiCommand {
        retained_with_clips(kind, id, parent_id, rect, text, values, &[])
    }

    fn retained_with_clips(
        kind: f64,
        id: u32,
        parent_id: u32,
        rect: [f64; 4],
        text: &str,
        values: &[f64],
        clips: &[(u32, [f64; 4])],
    ) -> GuiCommand {
        let values_count_index = 54 + clips.len() * 5;
        let mut scratch = vec![0.0; values_count_index + 1 + values.len()];
        scratch[0] = kind;
        scratch[6..10].copy_from_slice(&[48.0, 52.0, 58.0, 255.0]);
        scratch[10..14].copy_from_slice(&[72.0, 78.0, 88.0, 255.0]);
        scratch[14..18].copy_from_slice(&[32.0, 36.0, 42.0, 255.0]);
        scratch[18..22].copy_from_slice(&[240.0, 242.0, 246.0, 255.0]);
        scratch[22..26].copy_from_slice(&[80.0, 130.0, 220.0, 255.0]);
        scratch[34..38].copy_from_slice(&[92.0, 97.0, 108.0, 255.0]);
        scratch[38] = 1.0;
        scratch[39] = 3.0;
        scratch[40] = 1.0;
        scratch[26] = 14.0;
        scratch[52] = parent_id as f64;
        scratch[53] = clips.len() as f64;
        for (index, (owner_id, rect)) in clips.iter().enumerate() {
            let base = 54 + index * 5;
            scratch[base..base + 5].copy_from_slice(&[
                *owner_id as f64,
                rect[0],
                rect[1],
                rect[2],
                rect[3],
            ]);
        }
        scratch[values_count_index] = values.len() as f64;
        scratch[values_count_index + 1..].copy_from_slice(values);
        GuiCommand::new(GuiOpcode::Control, id, rect, text).with_scratch(scratch)
    }

    #[test]
    fn paint_color_channels_use_engine_byte_range() {
        assert_eq!(color_channel(128.0), 128);
        assert_eq!(color_channel(255.0), 255);
    }

    fn window(widget: UiCommand) -> Vec<UiCommand> {
        vec![
            UiCommand::new(
                UiBackend::Egui,
                UiOpcode::SetWindowPosition,
                100,
                [16.0, 16.0, 0.0, 0.0],
                "",
            ),
            UiCommand::new(
                UiBackend::Egui,
                UiOpcode::BeginWindow,
                100,
                [0.0; 4],
                "Settings",
            ),
            widget,
            UiCommand::new(UiBackend::Egui, UiOpcode::EndWindow, 100, [0.0; 4], ""),
        ]
    }

    fn click_at(pos: [f64; 2]) -> UiInputSnapshot {
        UiInputSnapshot {
            pointer_position: Some(pos),
            pointer_buttons: vec![
                UiPointerButtonEvent {
                    button: 0,
                    pressed: true,
                },
                UiPointerButtonEvent {
                    button: 0,
                    pressed: false,
                },
            ],
            ..Default::default()
        }
    }

    #[test]
    fn button_click_is_published_for_the_next_game_callback() {
        let mut ui = EguiUi::default();
        let commands = window(UiCommand::new(
            UiBackend::Egui,
            UiOpcode::Button,
            7,
            [0.0; 4],
            "Continue",
        ));

        ui.run_frame(
            &commands,
            &[],
            UiInputSnapshot::default(),
            [0.0, 0.0, 320.0, 240.0],
            1.0,
            1.0 / 60.0,
        );
        let clicked = ui.run_frame(
            &commands,
            &[],
            click_at([55.0, 62.0]),
            [0.0, 0.0, 320.0, 240.0],
            1.0,
            1.0 / 60.0,
        );
        assert!(clicked.response(7).clicked);
    }

    #[test]
    fn slider_response_carries_the_value_and_stale_ids_are_removed() {
        let mut ui = EguiUi::default();
        let slider = UiCommand::new(
            UiBackend::Egui,
            UiOpcode::SliderFloat,
            11,
            [0.75, 0.0, 1.0, 0.0],
            "Gain",
        );
        let first = ui.run_frame(
            &window(slider.clone()),
            &[],
            UiInputSnapshot::default(),
            [0.0, 0.0, 320.0, 240.0],
            1.0,
            1.0 / 60.0,
        );
        assert_eq!(first.response(11).value, 0.75);

        let second = ui.run_frame(
            &window(slider),
            &[],
            UiInputSnapshot::default(),
            [0.0, 0.0, 320.0, 240.0],
            1.0,
            1.0 / 60.0,
        );
        assert_eq!(second.response(11).value, 0.75);

        let missing = ui.run_frame(
            &[],
            &[],
            UiInputSnapshot::default(),
            [0.0, 0.0, 320.0, 240.0],
            1.0,
            1.0 / 60.0,
        );
        assert_eq!(missing.response(11), Default::default());
    }

    #[test]
    fn text_edit_accepts_a_whole_unicode_input_event() {
        let mut ui = EguiUi::default();
        let edit = UiCommand::new(UiBackend::Egui, UiOpcode::TextEdit, 12, [0.0; 4], "");
        let commands = window(edit);
        ui.run_frame(
            &commands,
            &[],
            UiInputSnapshot::default(),
            [0.0, 0.0, 320.0, 240.0],
            1.0,
            1.0 / 60.0,
        );
        ui.run_frame(
            &commands,
            &[],
            click_at([56.0, 62.0]),
            [0.0, 0.0, 320.0, 240.0],
            1.0,
            1.0 / 60.0,
        );

        let input = UiInputSnapshot {
            text: vec!["東京".to_owned()],
            ..Default::default()
        };
        let output = ui.run_frame(
            &commands,
            &[],
            input,
            [0.0, 0.0, 320.0, 240.0],
            1.0,
            1.0 / 60.0,
        );
        assert_eq!(output.response(12).text, "東京");
        assert!(output.text_edit_focused);
    }

    #[test]
    fn text_edit_applies_mixed_text_and_backspace_events_in_order() {
        let mut ui = EguiUi::default();
        let edit = UiCommand::new(UiBackend::Egui, UiOpcode::TextEdit, 12, [0.0; 4], "");
        let commands = window(edit);
        ui.run_frame(
            &commands,
            &[],
            UiInputSnapshot::default(),
            [0.0, 0.0, 320.0, 240.0],
            1.0,
            1.0 / 60.0,
        );
        ui.run_frame(
            &commands,
            &[],
            click_at([56.0, 62.0]),
            [0.0, 0.0, 320.0, 240.0],
            1.0,
            1.0 / 60.0,
        );

        let output = ui.run_frame(
            &commands,
            &[],
            UiInputSnapshot {
                ordered_events: vec![
                    UiInputEvent::Text("x".to_owned()),
                    UiInputEvent::Key(UiKeyEvent {
                        key: 8,
                        pressed: true,
                        repeated: false,
                    }),
                    UiInputEvent::Key(UiKeyEvent {
                        key: 8,
                        pressed: false,
                        repeated: false,
                    }),
                ],
                ..Default::default()
            },
            [0.0, 0.0, 320.0, 240.0],
            1.0,
            1.0 / 60.0,
        );

        assert_eq!(output.response(12).text, "");
    }

    #[test]
    fn egui_reports_pointer_capture_for_a_widget_under_the_cursor() {
        let mut ui = EguiUi::default();
        let output = ui.run_frame(
            &window(UiCommand::new(
                UiBackend::Egui,
                UiOpcode::Button,
                13,
                [0.0; 4],
                "Apply",
            )),
            &[],
            UiInputSnapshot {
                pointer_position: Some([56.0, 62.0]),
                ..Default::default()
            },
            [0.0, 0.0, 320.0, 240.0],
            1.0,
            1.0 / 60.0,
        );
        assert!(output.wants_pointer_input);
        assert!(!output.wants_keyboard_input);
    }

    #[test]
    fn egui_uses_native_pixels_per_point_for_high_dpi_surfaces() {
        let mut ui = EguiUi::default();
        ui.set_native_pixels_per_point(2.0);
        let output = ui.run_frame(
            &[],
            &[],
            UiInputSnapshot::default(),
            [0.0, 0.0, 320.0, 240.0],
            2.0,
            1.0 / 60.0,
        );

        assert_eq!(output.pixels_per_point, 2.0);
    }

    #[test]
    fn retained_control_uses_absolute_parent_relative_bounds() {
        let mut ui = EguiUi::default();
        let output = ui.run_frame(
            &[],
            &[retained(
                16.0,
                701,
                [24.0, 36.0, 120.0, 24.0],
                "Health",
                &[0.5, 0.0, 1.0],
            )],
            UiInputSnapshot::default(),
            [0.0, 0.0, 320.0, 240.0],
            1.0,
            1.0 / 60.0,
        );
        assert_eq!(output.gui_control_bounds[&701], [24.0, 36.0, 120.0, 24.0]);
    }

    #[test]
    fn nested_clip_intersects_parent_and_viewport() {
        let mut ui = EguiUi::default();
        let mut command = retained(1.0, 702, [-10.0, 10.0, 120.0, 100.0], "", &[]);
        command.scratch[1] = 1.0;
        command.scratch[2..6].copy_from_slice(&[20.0, 20.0, 300.0, 300.0]);
        let output = ui.run_frame(
            &[],
            &[command],
            UiInputSnapshot::default(),
            [0.0, 0.0, 320.0, 240.0],
            1.0,
            1.0 / 60.0,
        );
        assert_eq!(output.gui_clip_bounds[&702], [20.0, 20.0, 300.0, 220.0]);
    }

    #[test]
    fn profile_scope_is_restored_after_children() {
        let mut ui = EguiUi::default();
        let mut first = retained(1.0, 703, [0.0, 0.0, 80.0, 32.0], "", &[]);
        let mut second = retained(1.0, 704, [90.0, 0.0, 80.0, 32.0], "", &[]);
        first.scratch[6..10].copy_from_slice(&[255.0, 0.0, 0.0, 255.0]);
        second.scratch[6..10].copy_from_slice(&[0.0, 0.0, 255.0, 255.0]);
        let output = ui.run_frame(
            &[],
            &[first, second],
            UiInputSnapshot::default(),
            [0.0, 0.0, 320.0, 240.0],
            1.0,
            1.0 / 60.0,
        );
        assert_eq!(output.gui_background_colors[&703], [255, 0, 0, 255]);
        assert_eq!(output.gui_background_colors[&704], [0, 0, 255, 255]);
    }

    #[test]
    fn scroll_area_keeps_scroll_state_by_stable_id() {
        let mut ui = EguiUi::default();
        let scroll = retained(3.0, 705, [0.0, 0.0, 100.0, 60.0], "", &[]);
        let content = retained_with_parent(1.0, 719, 705, [0.0, 120.0, 20.0, 20.0], "", &[]);
        let input = UiInputSnapshot {
            pointer_position: Some([20.0, 20.0]),
            scroll_y: -48.0,
            ..Default::default()
        };
        ui.run_frame(
            &[],
            &[scroll.clone(), content.clone()],
            input,
            [0.0, 0.0, 320.0, 240.0],
            1.0,
            1.0 / 60.0,
        );
        let output = ui.run_frame(
            &[],
            &[scroll, content],
            UiInputSnapshot::default(),
            [0.0, 0.0, 320.0, 240.0],
            1.0,
            1.0 / 60.0,
        );
        assert!(output.gui_scroll_offsets[&705][1] > 0.0);
    }

    #[test]
    fn scroll_area_moves_and_clips_its_children() {
        let mut ui = EguiUi::default();
        let scroll = retained(3.0, 715, [0.0, 0.0, 100.0, 60.0], "", &[2.0, 0.0, 12.0]);
        let child = retained_with_clips(
            1.0,
            716,
            715,
            [8.0, 100.0, 40.0, 20.0],
            "",
            &[],
            &[(715, [0.0, 0.0, 100.0, 60.0])],
        );
        let input = UiInputSnapshot {
            pointer_position: Some([20.0, 20.0]),
            scroll_y: -48.0,
            ..Default::default()
        };
        let output = ui.run_frame(
            &[],
            &[scroll, child],
            input,
            [0.0, 0.0, 320.0, 240.0],
            1.0,
            1.0 / 60.0,
        );
        assert!(output.gui_scroll_offsets[&715][1] > 0.0);
        assert!(output.gui_control_bounds[&716][1] < 100.0);
        assert_eq!(output.gui_clip_bounds[&716], [0.0, 0.0, 100.0, 60.0]);
    }

    #[test]
    fn retained_value_payload_starts_after_parent_id_and_count() {
        let mut ui = EguiUi::default();
        let slider = retained_with_parent(
            16.0,
            717,
            88,
            [0.0, 0.0, 100.0, 20.0],
            "",
            &[0.75, 0.0, 1.0],
        );
        let output = ui.run_frame(
            &[],
            &[slider],
            UiInputSnapshot::default(),
            [0.0, 0.0, 320.0, 240.0],
            1.0,
            1.0 / 60.0,
        );
        assert_eq!(output.gui_response(717).value, 0.75);
    }

    #[test]
    fn reordering_controls_preserves_stable_id_widget_state() {
        let mut ui = EguiUi::default();
        let a = retained(16.0, 706, [0.0, 0.0, 100.0, 20.0], "A", &[0.2, 0.0, 1.0]);
        let b = retained(16.0, 707, [0.0, 30.0, 100.0, 20.0], "B", &[0.8, 0.0, 1.0]);
        let first = ui.run_frame(
            &[],
            &[a.clone(), b.clone()],
            UiInputSnapshot::default(),
            [0.0, 0.0, 320.0, 240.0],
            1.0,
            1.0 / 60.0,
        );
        let second = ui.run_frame(
            &[],
            &[b, a],
            UiInputSnapshot::default(),
            [0.0, 0.0, 320.0, 240.0],
            1.0,
            1.0 / 60.0,
        );
        assert_eq!(
            first.gui_response(706).value,
            second.gui_response(706).value
        );
        assert_eq!(
            first.gui_response(707).value,
            second.gui_response(707).value
        );
    }

    #[test]
    fn text_edit_retains_latest_native_value_until_applied() {
        let mut ui = EguiUi::default();
        let edit = retained(13.0, 708, [10.0, 10.0, 140.0, 24.0], "", &[]);
        ui.run_frame(
            &[],
            &[edit.clone()],
            click_at([20.0, 20.0]),
            [0.0, 0.0, 320.0, 240.0],
            1.0,
            1.0 / 60.0,
        );
        let typed = ui.run_frame(
            &[],
            &[edit.clone()],
            UiInputSnapshot {
                text: vec!["typed".into()],
                ..Default::default()
            },
            [0.0, 0.0, 320.0, 240.0],
            1.0,
            1.0 / 60.0,
        );
        assert_eq!(typed.gui_response(708).text, "typed");
        let next = retained(
            13.0,
            708,
            [10.0, 10.0, 140.0, 24.0],
            &typed.gui_response(708).text,
            &[],
        );
        assert_eq!(
            ui.run_frame(
                &[],
                &[next],
                UiInputSnapshot::default(),
                [0.0, 0.0, 320.0, 240.0],
                1.0,
                1.0 / 60.0
            )
            .gui_response(708)
            .text,
            "typed"
        );
    }

    #[test]
    fn native_value_is_returned_for_next_frame() {
        let mut ui = EguiUi::default();
        let command = retained(16.0, 709, [0.0, 0.0, 120.0, 24.0], "", &[0.25, 0.0, 1.0]);
        let output = ui.run_frame(
            &[],
            &[command],
            UiInputSnapshot::default(),
            [0.0, 0.0, 320.0, 240.0],
            1.0,
            1.0 / 60.0,
        );
        assert_eq!(output.gui_response(709).value, 0.25);
    }

    #[test]
    fn capture_flags_follow_focused_edit_and_hovered_controls() {
        let mut ui = EguiUi::default();
        let edit = retained(13.0, 710, [10.0, 10.0, 140.0, 24.0], "", &[]);
        let output = ui.run_frame(
            &[],
            &[edit],
            click_at([20.0, 20.0]),
            [0.0, 0.0, 320.0, 240.0],
            1.0,
            1.0 / 60.0,
        );
        assert!(output.gui_wants_pointer_input);
        assert!(output.gui_wants_keyboard_input);
    }

    #[test]
    fn retained_gui_paint_is_submitted_in_direct_2d_and_scene_3d_paths() {
        let mut ui = EguiUi::default();
        let command = retained(1.0, 711, [20.0, 20.0, 100.0, 50.0], "", &[]);
        let output = ui.run_frame(
            &[],
            &[command],
            UiInputSnapshot::default(),
            [0.0, 0.0, 320.0, 240.0],
            1.0,
            1.0 / 60.0,
        );
        assert!(!output.paint_jobs.is_empty());
    }

    #[test]
    fn retained_gui_response_ids_are_namespaced_from_game_ui_ids() {
        let mut ui = EguiUi::default();
        let immediate = UiCommand::new(
            UiBackend::Egui,
            UiOpcode::SliderFloat,
            712,
            [0.2, 0.0, 1.0, 0.0],
            "immediate",
        );
        let retained = retained(
            16.0,
            712,
            [0.0, 40.0, 120.0, 24.0],
            "retained",
            &[0.8, 0.0, 1.0],
        );
        let output = ui.run_frame(
            &[immediate],
            &[retained],
            UiInputSnapshot::default(),
            [0.0, 0.0, 320.0, 240.0],
            1.0,
            1.0 / 60.0,
        );
        assert_eq!(output.response(712).value, 0.2);
        assert_eq!(output.gui_response(712).value, 0.8);
    }

    #[test]
    fn retained_array_items_keep_labels_and_selection_by_stable_control_id() {
        let mut ui = EguiUi::default();
        let control = retained(20.0, 713, [10.0, 10.0, 180.0, 80.0], "", &[2.0, 1.0]);
        let items = [
            GuiCommand::new(GuiOpcode::Item, 713, [0.0, 1.0, 0.0, 0.0], "Alpha"),
            GuiCommand::new(GuiOpcode::Item, 713, [1.0, 1.0, 0.0, 0.0], "Beta"),
        ];
        let output = ui.run_frame(
            &[],
            &[control, items[0].clone(), items[1].clone()],
            UiInputSnapshot::default(),
            [0.0, 0.0, 320.0, 240.0],
            1.0,
            1.0 / 60.0,
        );
        assert_eq!(output.gui_response(713).value, 1.0);
        assert!(!output.paint_jobs.is_empty());
    }

    #[test]
    fn retained_array_with_no_selection_does_not_select_the_first_item() {
        let mut ui = EguiUi::default();
        let control = retained(20.0, 722, [10.0, 10.0, 180.0, 80.0], "", &[2.0, -1.0]);
        let items = [
            GuiCommand::new(GuiOpcode::Item, 722, [0.0, 1.0, 0.0, 0.0], "Alpha"),
            GuiCommand::new(GuiOpcode::Item, 722, [1.0, 1.0, 0.0, 0.0], "Beta"),
        ];
        let output = ui.run_frame(
            &[],
            &[control, items[0].clone(), items[1].clone()],
            UiInputSnapshot::default(),
            [0.0, 0.0, 320.0, 240.0],
            1.0,
            1.0 / 60.0,
        );
        assert_eq!(output.gui_response(722).value, -1.0);
    }

    #[test]
    fn retained_drawing_primitives_are_clipped_to_their_panel() {
        let mut ui = EguiUi::default();
        let mut panel = retained(27.0, 714, [10.0, 10.0, 60.0, 50.0], "", &[]);
        panel.scratch[1] = 1.0;
        panel.scratch[2..6].copy_from_slice(&[10.0, 10.0, 60.0, 50.0]);
        let drawing = GuiCommand::new(GuiOpcode::Drawing, 714, [0.0, 1.0, 10.0, 10.0], "")
            .with_scratch(vec![
                60.0, 50.0, 1.0, 10.0, 10.0, 60.0, 50.0, 0.0, 0.0, 80.0, 30.0, 255.0, 0.0, 0.0,
                255.0, 1.0, 1.0,
            ]);
        let output = ui.run_frame(
            &[],
            &[panel, drawing],
            UiInputSnapshot::default(),
            [0.0, 0.0, 320.0, 240.0],
            1.0,
            1.0 / 60.0,
        );
        assert_eq!(output.gui_clip_bounds[&714], [10.0, 10.0, 60.0, 50.0]);
        assert!(!output.paint_jobs.is_empty());
    }

    #[test]
    fn retained_bitmap_and_drawing_images_use_registered_texture_handles() {
        let mut ui = EguiUi::default();
        let bitmap = retained(
            24.0,
            720,
            [10.0, 10.0, 40.0, 30.0],
            "",
            &[1.0, 45.0, 1.5, 1.0, 1.0, 1.0, 1.0, 77.0],
        );
        let mut panel = retained(27.0, 721, [70.0, 10.0, 60.0, 50.0], "", &[]);
        panel.scratch[1] = 1.0;
        panel.scratch[2..6].copy_from_slice(&[70.0, 10.0, 60.0, 50.0]);
        let drawing = GuiCommand::new(GuiOpcode::Drawing, 721, [0.0, 4.0, 70.0, 10.0], "")
            .with_scratch(vec![
                60.0, 50.0, 1.0, 70.0, 10.0, 60.0, 50.0, 88.0, 0.0, 0.0, 24.0, 20.0, 255.0, 255.0,
                255.0, 255.0, 0.0,
            ]);
        let output = ui.run_frame(
            &[],
            &[bitmap, panel, drawing],
            UiInputSnapshot::default(),
            [0.0, 0.0, 320.0, 240.0],
            1.0,
            1.0 / 60.0,
        );
        let rendered_handles: HashSet<u64> = output
            .paint_jobs
            .iter()
            .filter_map(|job| match &job.primitive {
                egui::epaint::Primitive::Mesh(mesh) => match mesh.texture_id {
                    egui::TextureId::User(handle) => Some(handle),
                    egui::TextureId::Managed(_) => None,
                },
                egui::epaint::Primitive::Callback(_) => None,
            })
            .collect();
        assert!(rendered_handles.contains(&77));
        assert!(rendered_handles.contains(&88));
    }
}
