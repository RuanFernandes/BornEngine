use std::collections::{BTreeMap, HashMap, HashSet};
use std::sync::Arc;

use egui::{
    Align2, Color32, Context, Event, Id, Key, Modifiers, MouseWheelUnit, PointerButton, Pos2,
    RawInput, Rect, Shape, Stroke, TouchDeviceId, TouchId, TouchPhase, Ui, Vec2,
};

use super::{
    color_channel, UiBackend, UiCommand, UiInputEvent, UiInputSnapshot, UiOpcode, UiResponse,
};

#[derive(Default)]
pub struct EguiUi {
    context: Context,
    elapsed_seconds: f64,
    native_pixels_per_point: Option<f32>,
    active_touches: HashSet<usize>,
    active_tabs: HashMap<u32, u32>,
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
}

impl EguiFrameOutput {
    pub fn response(&self, id: u32) -> UiResponse {
        self.responses.get(&id).cloned().unwrap_or_default()
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
        input: UiInputSnapshot,
        screen_rect: [f32; 4],
        dt: f64,
    ) -> EguiFrameOutput {
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
            pairs,
            positions,
            sizes,
            default_window_size: Vec2::new(
                (screen_rect[2].min(372.0).max(128.0) - 32.0).max(96.0),
                (screen_rect[3].min(452.0).max(128.0) - 32.0).max(96.0),
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
        };
        let context = self.context.clone();
        let full_output = context.run_ui(raw_input, |ui| {
            state.render_range(ui, 0, state.commands.len());
        });
        let paint_jobs = context.tessellate(full_output.shapes, full_output.pixels_per_point);

        EguiFrameOutput {
            paint_jobs,
            textures_delta: full_output.textures_delta,
            platform_output: full_output.platform_output,
            pixels_per_point: full_output.pixels_per_point,
            responses: state.responses,
            registered_textures: state.registered_textures,
            wants_pointer_input: context.egui_wants_pointer_input(),
            wants_keyboard_input: context.egui_wants_keyboard_input(),
            text_edit_focused: state.text_edit_focused,
        }
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
    pairs: HashMap<usize, usize>,
    positions: HashMap<u32, Pos2>,
    sizes: HashMap<u32, Vec2>,
    default_window_size: Vec2,
    responses: HashMap<u32, UiResponse>,
    registered_textures: HashMap<u32, u64>,
    active_tabs: &'a mut HashMap<u32, u32>,
    custom_font_names: HashMap<u32, String>,
    text_edit_focused: bool,
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
                    .chunks_exact(2)
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
    use crate::ui::{
        EguiUi, UiBackend, UiCommand, UiInputEvent, UiInputSnapshot, UiKeyEvent, UiOpcode,
        UiPointerButtonEvent,
    };

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
            UiInputSnapshot::default(),
            [0.0, 0.0, 320.0, 240.0],
            1.0 / 60.0,
        );
        let clicked = ui.run_frame(
            &commands,
            click_at([55.0, 62.0]),
            [0.0, 0.0, 320.0, 240.0],
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
            UiInputSnapshot::default(),
            [0.0, 0.0, 320.0, 240.0],
            1.0 / 60.0,
        );
        assert_eq!(first.response(11).value, 0.75);

        let second = ui.run_frame(
            &window(slider),
            UiInputSnapshot::default(),
            [0.0, 0.0, 320.0, 240.0],
            1.0 / 60.0,
        );
        assert_eq!(second.response(11).value, 0.75);

        let missing = ui.run_frame(
            &[],
            UiInputSnapshot::default(),
            [0.0, 0.0, 320.0, 240.0],
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
            UiInputSnapshot::default(),
            [0.0, 0.0, 320.0, 240.0],
            1.0 / 60.0,
        );
        ui.run_frame(
            &commands,
            click_at([56.0, 62.0]),
            [0.0, 0.0, 320.0, 240.0],
            1.0 / 60.0,
        );

        let input = UiInputSnapshot {
            text: vec!["東京".to_owned()],
            ..Default::default()
        };
        let output = ui.run_frame(&commands, input, [0.0, 0.0, 320.0, 240.0], 1.0 / 60.0);
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
            UiInputSnapshot::default(),
            [0.0, 0.0, 320.0, 240.0],
            1.0 / 60.0,
        );
        ui.run_frame(
            &commands,
            click_at([56.0, 62.0]),
            [0.0, 0.0, 320.0, 240.0],
            1.0 / 60.0,
        );

        let output = ui.run_frame(
            &commands,
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
            UiInputSnapshot {
                pointer_position: Some([56.0, 62.0]),
                ..Default::default()
            },
            [0.0, 0.0, 320.0, 240.0],
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
            UiInputSnapshot::default(),
            [0.0, 0.0, 320.0, 240.0],
            1.0 / 60.0,
        );

        assert_eq!(output.pixels_per_point, 2.0);
    }
}
