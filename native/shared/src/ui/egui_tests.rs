use super::color_channel;
use crate::gui::{GuiCommand, GuiEventType, GuiOpcode};
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

fn pointer_button_at(pos: [f64; 2], pressed: bool) -> UiInputSnapshot {
    UiInputSnapshot {
        pointer_position: Some(pos),
        pointer_buttons: vec![UiPointerButtonEvent { button: 0, pressed }],
        ..Default::default()
    }
}

fn move_pointer_to(pos: [f64; 2], delta: [f64; 2]) -> UiInputSnapshot {
    UiInputSnapshot {
        pointer_position: Some(pos),
        pointer_delta: delta,
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
fn retained_text_edit_requests_the_native_keyboard() {
    let mut ui = EguiUi::default();
    let edit = retained(13.0, 723, [10.0, 10.0, 140.0, 24.0], "", &[]);
    let output = ui.run_frame(
        &[],
        &[edit],
        click_at([20.0, 20.0]),
        [0.0, 0.0, 320.0, 240.0],
        1.0,
        1.0 / 60.0,
    );
    assert!(output.text_edit_focused);
}

#[test]
fn retained_editable_popup_returns_typed_text() {
    let mut ui = EguiUi::default();
    let popup = retained(18.0, 727, [10.0, 10.0, 180.0, 28.0], "", &[0.0, -1.0]);
    ui.run_frame(
        &[],
        &[popup.clone()],
        click_at([20.0, 20.0]),
        [0.0, 0.0, 320.0, 240.0],
        1.0,
        1.0 / 60.0,
    );
    let typed = ui.run_frame(
        &[],
        &[popup],
        UiInputSnapshot {
            text: vec!["typed".into()],
            ..Default::default()
        },
        [0.0, 0.0, 320.0, 240.0],
        1.0,
        1.0 / 60.0,
    );
    assert_eq!(typed.gui_response(727).text, "typed");
}

#[test]
fn retained_text_edit_slider_applies_numeric_filter_and_max_length_payload() {
    let mut ui = EguiUi::default();
    let rect = [10.0, 10.0, 180.0, 28.0];
    let slider = retained(
        15.0,
        728,
        rect,
        "",
        &[0.0, 0.0, 100.0, 0.0, 1.0, 2.0, 0.0, 0.0],
    );
    ui.run_frame(
        &[],
        &[slider.clone()],
        click_at([20.0, 20.0]),
        [0.0, 0.0, 320.0, 240.0],
        1.0,
        1.0 / 60.0,
    );
    let typed = ui.run_frame(
        &[],
        &[slider],
        UiInputSnapshot {
            text: vec!["1x2".into()],
            ..Default::default()
        },
        [0.0, 0.0, 320.0, 240.0],
        1.0,
        1.0 / 60.0,
    );
    assert_eq!(typed.gui_response(728).text, "12");
    assert_eq!(typed.gui_response(728).value, 12.0);
}

#[test]
fn retained_text_edit_slider_treats_zero_max_length_as_unlimited() {
    let mut ui = EguiUi::default();
    let rect = [10.0, 10.0, 180.0, 28.0];
    let slider = retained(15.0, 729, rect, "", &[0.0, 0.0, 100_000.0, 0.0, 1.0, 0.0]);
    ui.run_frame(
        &[],
        &[slider.clone()],
        click_at([20.0, 20.0]),
        [0.0, 0.0, 320.0, 240.0],
        1.0,
        1.0 / 60.0,
    );
    let typed = ui.run_frame(
        &[],
        &[slider],
        UiInputSnapshot {
            text: vec!["12x345".into()],
            ..Default::default()
        },
        [0.0, 0.0, 320.0, 240.0],
        1.0,
        1.0 / 60.0,
    );
    assert_eq!(typed.gui_response(729).text, "12345");
    assert_eq!(typed.gui_response(729).value, 12_345.0);
}

#[test]
fn retained_checkbox_changes_once_after_a_split_pointer_click() {
    let mut ui = EguiUi::default();
    let rect = [10.0, 10.0, 120.0, 28.0];
    let initial = retained(8.0, 724, rect, "Enabled", &[0.0]);
    ui.run_frame(
        &[],
        &[initial.clone()],
        UiInputSnapshot::default(),
        [0.0, 0.0, 320.0, 240.0],
        1.0,
        1.0 / 60.0,
    );

    let pressed = ui.run_frame(
        &[],
        &[initial.clone()],
        pointer_button_at([20.0, 20.0], true),
        [0.0, 0.0, 320.0, 240.0],
        1.0,
        1.0 / 60.0,
    );
    let released = ui.run_frame(
        &[],
        &[retained(
            8.0,
            724,
            rect,
            "Enabled",
            &[pressed.gui_response(724).value],
        )],
        pointer_button_at([20.0, 20.0], false),
        [0.0, 0.0, 320.0, 240.0],
        1.0,
        1.0 / 60.0,
    );

    assert_eq!(released.gui_response(724).value, 1.0);
    assert_eq!(
        released
            .gui_events
            .iter()
            .filter(|event| event.event_type == crate::gui::GuiEventType::Change)
            .count(),
        1
    );
}

#[test]
fn retained_overlapping_buttons_emit_one_action_for_the_topmost_control() {
    let mut ui = EguiUi::default();
    let rect = [10.0, 10.0, 120.0, 28.0];
    let commands = [
        retained(7.0, 725, rect, "Back", &[]),
        retained(7.0, 726, rect, "Front", &[]),
    ];
    ui.run_frame(
        &[],
        &commands,
        UiInputSnapshot::default(),
        [0.0, 0.0, 320.0, 240.0],
        1.0,
        1.0 / 60.0,
    );
    let pressed = ui.run_frame(
        &[],
        &commands,
        pointer_button_at([20.0, 20.0], true),
        [0.0, 0.0, 320.0, 240.0],
        1.0,
        1.0 / 60.0,
    );
    assert!(!pressed
        .gui_events
        .iter()
        .any(|event| event.event_type == crate::gui::GuiEventType::Action));
    let released = ui.run_frame(
        &[],
        &commands,
        pointer_button_at([20.0, 20.0], false),
        [0.0, 0.0, 320.0, 240.0],
        1.0,
        1.0 / 60.0,
    );
    let actions: Vec<_> = released
        .gui_events
        .iter()
        .filter(|event| event.event_type == crate::gui::GuiEventType::Action)
        .map(|event| event.control_id)
        .collect();
    assert_eq!(actions, vec![726]);
}

#[test]
fn retained_child_action_is_not_emitted_directly_by_its_panel() {
    let mut ui = EguiUi::default();
    let rect = [10.0, 10.0, 150.0, 80.0];
    let parent = retained(1.0, 729, rect, "", &[]);
    let child = retained_with_parent(7.0, 730, 729, rect, "Run", &[]);
    let commands = [parent, child];
    ui.run_frame(
        &[],
        &commands,
        UiInputSnapshot::default(),
        [0.0, 0.0, 320.0, 240.0],
        1.0,
        1.0 / 60.0,
    );
    ui.run_frame(
        &[],
        &commands,
        pointer_button_at([20.0, 20.0], true),
        [0.0, 0.0, 320.0, 240.0],
        1.0,
        1.0 / 60.0,
    );
    let released = ui.run_frame(
        &[],
        &commands,
        pointer_button_at([20.0, 20.0], false),
        [0.0, 0.0, 320.0, 240.0],
        1.0,
        1.0 / 60.0,
    );
    let actions: Vec<_> = released
        .gui_events
        .iter()
        .filter(|event| event.event_type == crate::gui::GuiEventType::Action)
        .map(|event| event.control_id)
        .collect();
    assert_eq!(actions, vec![730]);
}

#[test]
fn retained_window_moves_resizes_and_reports_close() {
    let mut ui = EguiUi::default();
    let screen = [0.0, 0.0, 320.0, 240.0];
    let mut rect = [10.0, 10.0, 100.0, 80.0];
    let mut command = retained(2.0, 731, rect, "Inventory", &[1.0, 1.0, 1.0]);
    ui.run_frame(
        &[],
        &[command.clone()],
        UiInputSnapshot::default(),
        screen,
        1.0,
        1.0 / 60.0,
    );
    ui.run_frame(
        &[],
        &[command.clone()],
        pointer_button_at([20.0, 20.0], true),
        screen,
        1.0,
        1.0 / 60.0,
    );
    let moved = ui.run_frame(
        &[],
        &[command.clone()],
        move_pointer_to([50.0, 40.0], [30.0, 20.0]),
        screen,
        1.0,
        1.0 / 60.0,
    );
    assert!(moved.gui_response(731).rect[0] > 10.0);
    let moved = ui.run_frame(
        &[],
        &[command.clone()],
        pointer_button_at([50.0, 40.0], false),
        screen,
        1.0,
        1.0 / 60.0,
    );
    rect = moved.gui_response(731).rect;
    command = retained(2.0, 731, rect, "Inventory", &[1.0, 1.0, 1.0]);

    let corner = [
        rect[0] as f64 + rect[2] as f64 - 5.0,
        rect[1] as f64 + rect[3] as f64 - 5.0,
    ];
    ui.run_frame(
        &[],
        &[command.clone()],
        pointer_button_at(corner, true),
        screen,
        1.0,
        1.0 / 60.0,
    );
    let resized = ui.run_frame(
        &[],
        &[command.clone()],
        move_pointer_to([corner[0] + 20.0, corner[1] + 15.0], [20.0, 15.0]),
        screen,
        1.0,
        1.0 / 60.0,
    );
    assert!(resized.gui_response(731).rect[2] > rect[2]);
    let resized = ui.run_frame(
        &[],
        &[command.clone()],
        pointer_button_at([corner[0] + 20.0, corner[1] + 15.0], false),
        screen,
        1.0,
        1.0 / 60.0,
    );
    rect = resized.gui_response(731).rect;
    command = retained(2.0, 731, rect, "Inventory", &[1.0, 1.0, 1.0]);

    let title_height = 22.0;
    let close_point = [rect[0] + rect[2] - 15.0, rect[1] + title_height / 2.0];
    let closed = ui.run_frame(
        &[],
        &[command],
        click_at(close_point),
        screen,
        1.0,
        1.0 / 60.0,
    );
    assert_eq!(closed.gui_response(731).value, 0.0);
}

#[test]
fn retained_frame_set_lays_out_children_and_resizes_splitters() {
    let mut ui = EguiUi::default();
    let screen = [0.0, 0.0, 320.0, 240.0];
    let frame_set = retained(6.0, 732, [10.0, 10.0, 200.0, 100.0], "", &[2.0, 1.0, 4.0]);
    let first = retained_with_parent(1.0, 733, 732, [10.0, 10.0, 50.0, 50.0], "", &[]);
    let second = retained_with_parent(1.0, 734, 732, [10.0, 10.0, 50.0, 50.0], "", &[]);
    let commands = [frame_set, first, second];
    let initial = ui.run_frame(
        &[],
        &commands,
        UiInputSnapshot::default(),
        screen,
        1.0,
        1.0 / 60.0,
    );
    assert_eq!(initial.gui_response(733).rect, [10.0, 10.0, 98.0, 100.0]);
    assert_eq!(initial.gui_response(734).rect, [112.0, 10.0, 98.0, 100.0]);

    ui.run_frame(
        &[],
        &commands,
        pointer_button_at([110.0, 50.0], true),
        screen,
        1.0,
        1.0 / 60.0,
    );
    let resized = ui.run_frame(
        &[],
        &commands,
        move_pointer_to([130.0, 50.0], [20.0, 0.0]),
        screen,
        1.0,
        1.0 / 60.0,
    );
    assert!(resized.gui_response(733).rect[2] > 98.0);
    assert!(resized.gui_response(734).rect[0] > 112.0);
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
    assert!(
        output.gui_wants_pointer_input,
        "response: {:?}",
        output.gui_response(710)
    );
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
fn nested_frame_set_children_use_the_native_parent_cell_size_immediately() {
    let mut ui = EguiUi::default();
    let outer = retained(6.0, 730, [0.0, 0.0, 240.0, 160.0], "", &[2.0, 1.0, 4.0]);
    let inner = retained_with_parent(6.0, 731, 730, [0.0, 0.0, 40.0, 40.0], "", &[1.0, 1.0, 4.0]);
    let inner_child = retained_with_parent(1.0, 732, 731, [0.0, 0.0, 40.0, 40.0], "", &[]);
    let outer_sibling = retained_with_parent(1.0, 733, 730, [0.0, 0.0, 40.0, 40.0], "", &[]);
    let output = ui.run_frame(
        &[],
        &[outer, inner, inner_child, outer_sibling],
        UiInputSnapshot::default(),
        [0.0, 0.0, 320.0, 240.0],
        1.0,
        1.0 / 60.0,
    );

    let inner_bounds = output.gui_response(731).rect;
    let child_bounds = output.gui_response(732).rect;
    assert!((inner_bounds[2] - 118.0).abs() < 0.1);
    assert!((child_bounds[2] - inner_bounds[2]).abs() < 0.1);
    assert!((child_bounds[3] - inner_bounds[3]).abs() < 0.1);
}

#[test]
fn retained_tab_bar_click_selects_tab_without_page_overlap() {
    let mut ui = EguiUi::default();
    let tabs = retained(21.0, 734, [10.0, 10.0, 300.0, 200.0], "One", &[2.0, 0.0]);
    let first = GuiCommand::new(GuiOpcode::Item, 734, [0.0, 1.0, 0.0, 0.0], "One");
    let second = GuiCommand::new(GuiOpcode::Item, 734, [1.0, 2.0, 0.0, 0.0], "Two");
    let page = retained_with_parent(1.0, 735, 734, [10.0, 38.0, 300.0, 172.0], "", &[]);
    let commands = [tabs, first, second, page];
    ui.run_frame(
        &[],
        &commands,
        UiInputSnapshot::default(),
        [0.0, 0.0, 400.0, 300.0],
        1.0,
        1.0 / 60.0,
    );
    ui.run_frame(
        &[],
        &commands,
        pointer_button_at([240.0, 20.0], true),
        [0.0, 0.0, 400.0, 300.0],
        1.0,
        1.0 / 60.0,
    );
    let output = ui.run_frame(
        &[],
        &commands,
        pointer_button_at([240.0, 20.0], false),
        [0.0, 0.0, 400.0, 300.0],
        1.0,
        1.0 / 60.0,
    );

    assert_eq!(output.gui_response(734).value, 1.0);
    assert_eq!(output.gui_response(735).rect, [10.0, 38.0, 300.0, 172.0]);
}

#[test]
fn retained_text_edit_honors_programmatic_focus_and_blur_requests() {
    let mut ui = EguiUi::default();
    let focus_values = [0.0, 0.0, 0.0, -1_247_107_654.0, 1.0];
    let edit = retained(13.0, 736, [10.0, 10.0, 160.0, 24.0], "", &focus_values);
    let focused = ui.run_frame(
        &[],
        &[edit],
        UiInputSnapshot::default(),
        [0.0, 0.0, 320.0, 240.0],
        1.0,
        1.0 / 60.0,
    );
    assert!(focused.gui_response(736).focused);
    assert!(focused.wants_keyboard_input);

    let blur_values = [0.0, 0.0, 0.0, -1_247_107_654.0, 2.0];
    let edit = retained(13.0, 736, [10.0, 10.0, 160.0, 24.0], "", &blur_values);
    let blurred = ui.run_frame(
        &[],
        &[edit],
        UiInputSnapshot::default(),
        [0.0, 0.0, 320.0, 240.0],
        1.0,
        1.0 / 60.0,
    );
    assert!(!blurred.gui_response(736).focused);
}

#[test]
fn stretch_parent_scales_pointer_local_coordinates_to_virtual_space() {
    let mut ui = EguiUi::default();
    let stretch = retained(5.0, 737, [10.0, 20.0, 200.0, 100.0], "", &[100.0, 50.0]);
    let child = retained_with_parent(0.0, 738, 737, [30.0, 30.0, 40.0, 20.0], "", &[]);
    let commands = [stretch, child];
    ui.run_frame(
        &[],
        &commands,
        UiInputSnapshot::default(),
        [0.0, 0.0, 320.0, 240.0],
        1.0,
        1.0 / 60.0,
    );
    let output = ui.run_frame(
        &[],
        &commands,
        move_pointer_to([35.0, 35.0], [35.0, 35.0]),
        [0.0, 0.0, 320.0, 240.0],
        1.0,
        1.0 / 60.0,
    );
    let event = output
        .gui_events
        .iter()
        .find(|event| event.control_id == 738 && event.event_type == GuiEventType::PointerEnter)
        .unwrap_or_else(|| {
            panic!(
                "response: {:?}; events: {:?}",
                output.gui_response(738),
                output.gui_events
            )
        });
    assert_eq!([event.local_x, event.local_y], [2.5, 2.5]);
}

#[test]
fn nested_stretch_parents_compose_pointer_local_coordinates() {
    let mut ui = EguiUi::default();
    let outer = retained(5.0, 741, [10.0, 20.0, 200.0, 100.0], "", &[100.0, 50.0]);
    let inner = retained_with_parent(5.0, 742, 741, [30.0, 40.0, 160.0, 80.0], "", &[40.0, 20.0]);
    let child = retained_with_parent(0.0, 743, 742, [50.0, 60.0, 60.0, 40.0], "", &[]);
    let commands = [outer, inner, child];
    ui.run_frame(
        &[],
        &commands,
        UiInputSnapshot::default(),
        [0.0, 0.0, 400.0, 300.0],
        1.0,
        1.0 / 60.0,
    );
    let output = ui.run_frame(
        &[],
        &commands,
        move_pointer_to([70.0, 80.0], [70.0, 80.0]),
        [0.0, 0.0, 400.0, 300.0],
        1.0,
        1.0 / 60.0,
    );

    let event = output
        .gui_events
        .iter()
        .find(|event| event.control_id == 743 && event.event_type == GuiEventType::PointerEnter)
        .unwrap_or_else(|| panic!("events: {:?}", output.gui_events));
    assert_eq!([event.local_x, event.local_y], [5.0, 5.0]);
}

#[test]
fn bitmap_border_tiles_profile_texture_at_its_native_size() {
    let mut ui = EguiUi::default();
    let mut tiled = retained(4.0, 739, [0.0, 0.0, 24.0, 12.0], "", &[1.0, 8.0, 4.0]);
    tiled.scratch[51] = 77.0;
    let mut stretched = retained(4.0, 740, [30.0, 0.0, 24.0, 12.0], "", &[0.0, 8.0, 4.0]);
    stretched.scratch[51] = 77.0;
    let output = ui.run_frame(
        &[],
        &[tiled, stretched],
        UiInputSnapshot::default(),
        [0.0, 0.0, 320.0, 240.0],
        1.0,
        1.0 / 60.0,
    );
    let vertex_counts: Vec<_> = output
        .paint_jobs
        .iter()
        .filter_map(|job| match &job.primitive {
            egui::epaint::Primitive::Mesh(mesh) if mesh.texture_id == egui::TextureId::User(77) => {
                Some(mesh.vertices.len())
            }
            _ => None,
        })
        .collect();
    assert_eq!(
        vertex_counts.iter().sum::<usize>(),
        64,
        "texture mesh vertices: {vertex_counts:?}"
    );

    let contains_point = |mesh: &egui::Mesh, point: egui::Pos2| {
        mesh.indices.chunks_exact(3).any(|indices| {
            let a = mesh.vertices[indices[0] as usize].pos;
            let b = mesh.vertices[indices[1] as usize].pos;
            let c = mesh.vertices[indices[2] as usize].pos;
            let sign = |p1: egui::Pos2, p2: egui::Pos2, p3: egui::Pos2| {
                (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y)
            };
            let first = sign(point, a, b);
            let second = sign(point, b, c);
            let third = sign(point, c, a);
            (first >= 0.0 && second >= 0.0 && third >= 0.0)
                || (first <= 0.0 && second <= 0.0 && third <= 0.0)
        })
    };
    let texture_meshes: Vec<_> = output
        .paint_jobs
        .iter()
        .filter_map(|job| match &job.primitive {
            egui::epaint::Primitive::Mesh(mesh) if mesh.texture_id == egui::TextureId::User(77) => {
                Some(mesh)
            }
            _ => None,
        })
        .collect();
    assert!(texture_meshes
        .iter()
        .any(|mesh| contains_point(mesh, egui::Pos2::new(12.0, 0.5))));
    assert!(texture_meshes
        .iter()
        .any(|mesh| contains_point(mesh, egui::Pos2::new(42.0, 0.5))));
    assert!(!texture_meshes
        .iter()
        .any(|mesh| contains_point(mesh, egui::Pos2::new(12.0, 6.0))));
    assert!(!texture_meshes
        .iter()
        .any(|mesh| contains_point(mesh, egui::Pos2::new(42.0, 6.0))));
}

#[test]
fn retained_drawing_primitives_are_clipped_to_their_panel() {
    let mut ui = EguiUi::default();
    let mut panel = retained(27.0, 714, [10.0, 10.0, 60.0, 50.0], "", &[]);
    panel.scratch[1] = 1.0;
    panel.scratch[2..6].copy_from_slice(&[10.0, 10.0, 60.0, 50.0]);
    let drawing = GuiCommand::new(GuiOpcode::Drawing, 714, [0.0, 1.0, 10.0, 10.0], "")
        .with_scratch(vec![
            60.0, 50.0, 1.0, 10.0, 10.0, 60.0, 50.0, 0.0, 0.0, 80.0, 30.0, 255.0, 0.0, 0.0, 255.0,
            1.0, 1.0,
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
