import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import test from 'node:test';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) {
      return nextResolve(`${specifier}.ts`, context);
    }
    return nextResolve(specifier, context);
  },
});

const {
  GUI, GUIManager, GUIEventType, GuiProfile, GUIProfiles, GuiControlKind,
  GuiNativeBridge, GuiOpcode, GuiEventField,
  GuiWindow, GuiPanel, GuiScroll, GuiBitmapBorder, GuiStretch, GuiFrameSet,
  GuiButtonBase, GuiButton, GuiCheckBox, GuiRadioButton, GuiBitmapButton,
  GuiText, GuiMLText, GuiTextEdit, GuiMLTextEdit, GuiTextEditSlider, GuiSlider,
  GuiArray, GuiPopUpMenu, GuiPopUpEdit, GuiTreeView, GuiTextList, GuiTab, GuiMenu, GuiContextMenu,
  GuiBitmap, GuiShowImg, GuiProgress, GuiDrawingPanel,
  GUI_TREE_MAX_PATH_LENGTH,
} = await import('../src/gui/index.ts');
const { GUIIdAllocator } = await import('../src/gui/types.ts');
const { bindGameContext, GameContext } = await import('../src/core/context.ts');

test('GUI.center_uses_parent_content_bounds_and_reflows_after_resize', () => {
  const parent = new GUI({ width: 300, height: 200 });
  const child = new GUI({ width: 100, height: 80 });
  parent.addControl(child);

  child.center();
  assert.deepEqual(child.getPosition(), { x: 100, y: 60 });

  parent.setSize(500, 300);
  assert.deepEqual(child.getPosition(), { x: 200, y: 110 });
});

test('GUI.ids_stay_stable_after_reordering_and_never_wrap', () => {
  const parent = new GUI();
  const first = new GUI();
  const second = new GUI();
  const firstId = first.id;
  const secondId = second.id;
  parent.addControl(first);
  parent.addControl(second);

  first.bringToFront();
  assert.deepEqual(parent.getControls(), [second, first]);
  assert.equal(first.id, firstId);
  assert.equal(second.id, secondId);
  assert.notEqual(first.id, second.id);

  const allocator = new GUIIdAllocator(0xffff_fffe);
  assert.equal(allocator.allocate(), 0xffff_fffe);
  assert.equal(allocator.allocate(), 0xffff_ffff);
  assert.throws(() => allocator.allocate(), /exhausted/i);
});

test('GUI.setX_clears_only_horizontal_center_anchor', () => {
  const parent = new GUI({ width: 300, height: 200 });
  const child = new GUI({ width: 100, height: 80 });
  parent.addControl(child);
  child.center();

  child.setX(15);
  parent.setSize(500, 300);

  assert.deepEqual(child.getPosition(), { x: 15, y: 110 });
});

test('GUI.invalid_geometry_does_not_clear_center_anchor', () => {
  const parent = new GUI({ width: 300, height: 200 });
  const child = new GUI({ width: 100, height: 80 });
  const vertical = new GUI({ width: 100, height: 80 });
  const positioned = new GUI({ width: 100, height: 80 });
  const resized = new GUI({ width: 100, height: 80 });
  parent.addControl(child);
  parent.addControl(vertical);
  parent.addControl(positioned);
  parent.addControl(resized);
  child.centerHorizontal();
  vertical.centerVertical();
  positioned.center();
  resized.center();

  assert.throws(() => child.setX(Number.NaN), RangeError);
  assert.throws(() => vertical.setY(Number.POSITIVE_INFINITY), RangeError);
  assert.throws(() => positioned.setPosition(Number.NaN, 10), RangeError);
  assert.throws(() => resized.resize(10, 10, -1, 20), RangeError);
  parent.setSize(500, 300);
  assert.equal(child.getX(), 200);
  assert.equal(vertical.getY(), 110);
  assert.deepEqual(positioned.getPosition(), { x: 200, y: 110 });
  assert.deepEqual(resized.getPosition(), { x: 200, y: 110 });
});

test('GUI.rejects_cycles_and_cross_game_reparenting', () => {
  const a = new GUI();
  const b = new GUI();
  const child = new GUI();
  a.addControl(b);
  b.addControl(child);
  assert.throws(() => child.addControl(a), /cycle/i);

  const managerA = new GUIManager({});
  const managerB = new GUIManager({});
  const owned = new GUI();
  managerA.addControl(owned);
  assert.throws(() => managerB.addControl(owned), /parent|owner|game/i);
  assert.equal(owned.getParent(), null);
  assert.deepEqual(managerA.getControls(), [owned]);
  assert.deepEqual(managerB.getControls(), []);
});

test('GUI.events_bubble_and_stop_at_current_target', () => {
  const calls = [];
  class RecordingGUI extends GUI {
    constructor(name, stop = false) {
      super();
      this.name = name;
      this.stop = stop;
    }
    onAction(event) {
      calls.push([this.name, event.currentTarget.name, event.target.name]);
      if (this.stop) event.stopPropagation();
    }
  }

  const root = new RecordingGUI('root');
  const parent = new RecordingGUI('parent', true);
  const target = new RecordingGUI('target');
  root.addControl(parent);
  parent.addControl(target);
  const manager = new GUIManager({});
  manager.addControl(root);

  manager.dispatchEvent(target, GUIEventType.Action);

  assert.deepEqual(calls, [
    ['target', 'target', 'target'],
    ['parent', 'parent', 'target'],
  ]);
});

test('GUI.focus_clears_when_subtree_is_detached', () => {
  const manager = new GUIManager({});
  const parent = new GUI();
  const child = new GUI();
  parent.addControl(child);
  manager.addControl(parent);
  child.focus();

  assert.equal(child.isFocused(), true);
  assert.equal(manager.getFocusedControl(), child);

  manager.removeControl(parent);
  assert.equal(child.isFocused(), false);
  assert.equal(manager.getFocusedControl(), null);
});

test('GUI.geometry_helpers_convert_coordinates_and_reject_invalid_values', () => {
  const root = new GUI({ x: 10, y: 20, width: 500, height: 400 });
  const child = new GUI({ x: 7, y: 9, width: 100, height: 60 });
  const nested = new GUI({ x: 3, y: 4, width: 10, height: 10 });
  root.addControl(child);
  child.addControl(nested);

  assert.deepEqual(nested.localToGlobal({ x: 2, y: 5 }), { x: 22, y: 38 });
  assert.deepEqual(nested.globalToLocal({ x: 22, y: 38 }), { x: 2, y: 5 });
  assert.equal(nested.getRoot(), root);
  assert.throws(() => child.setX(Number.NaN), RangeError);
  assert.throws(() => child.setY(Number.POSITIVE_INFINITY), RangeError);
  assert.throws(() => child.setWidth(-1), RangeError);
  assert.throws(() => child.setHeight(Number.NaN), RangeError);
});

test('GUI.lifecycle_visibility_clipping_and_order_helpers_are_stateful', () => {
  const parent = new GUI({ width: 100, height: 100 });
  const first = new GUI();
  const second = new GUI();
  parent.addControl(first);
  parent.addControl(second);

  first.hide().setActive(false).setClipChildren(true).setClipToBounds(true);
  assert.equal(first.isVisible(), false);
  assert.equal(first.isActive(), false);
  first.show().setActive(true);
  assert.equal(first.isVisible(), true);
  assert.equal(first.isActive(), true);

  first.setMinimumSize(12, 14).setHint('hint').setCursor('pointer');
  assert.deepEqual(first.getMinimumSize(), { width: 12, height: 14 });
  assert.equal(first.getHint(), 'hint');
  assert.equal(first.getCursor(), 'pointer');

  first.bringToFront();
  assert.deepEqual(parent.getControls(), [second, first]);
  first.pushToBack();
  assert.deepEqual(parent.getControls(), [first, second]);
  assert.equal(first.getParent(), parent);
});

test('GUI.focus_helpers_select_first_responder_and_detach_cleanly', () => {
  const manager = new GUIManager({});
  const root = new GUI();
  const first = new GUI();
  const second = new GUI();
  root.addControl(first);
  root.addControl(second);
  manager.addControl(root);

  second.makeFirstResponder();
  assert.equal(second.isFirstResponder(), true);
  assert.equal(second.isFocused(), true);
  second.blur();
  assert.equal(second.isFocused(), false);

  root.tabFirst();
  assert.equal(first.isFocused(), true);
  first.destroy();
  assert.deepEqual(root.getControls(), [second]);
  assert.equal(first.getParent(), null);
});

test('GUIProfiles.clone_is_independent_of_registered_profile', () => {
  const profile = new GuiProfile({
    normalColor: { r: 0.2, g: 0.3, b: 0.4, a: 1 },
    font: { family: 'Inter', size: 18, bold: true, italic: false },
    border: { color: { r: 0, g: 0, b: 0, a: 1 }, width: 2, radius: 4 },
    shadow: { color: { r: 0, g: 0, b: 0, a: 0.5 }, offsetX: 1, offsetY: 2, blur: 3 },
    spacing: { item: 5, padding: 6, inner: 7 },
  });
  GUIProfiles.register('gui-api-profile-clone', profile);

  const clone = GUIProfiles.clone('gui-api-profile-clone');
  clone.normalColor.r = 0.9;
  clone.font.size = 30;
  clone.border.color.a = 0.25;
  clone.shadow.offsetX = 9;
  clone.spacing.inner = 12;

  assert.equal(GUIProfiles.get('gui-api-profile-clone').normalColor.r, 0.2);
  assert.equal(GUIProfiles.get('gui-api-profile-clone').font.size, 18);
  assert.equal(GUIProfiles.get('gui-api-profile-clone').border.color.a, 1);
  assert.equal(GUIProfiles.get('gui-api-profile-clone').shadow.offsetX, 1);
  assert.equal(GUIProfiles.get('gui-api-profile-clone').spacing.inner, 7);
  for (const name of ['default', 'text', 'button', 'window', 'scroll', 'checkbox', 'radio', 'popup', 'slider', 'progress', 'tree', 'list', 'blue', 'blue-button', 'blue-window']) {
    assert.ok(GUIProfiles.get(name) instanceof GuiProfile, `missing built-in profile: ${name}`);
  }
});

test('GUIProfiles.rejects_duplicate_names_and_unknown_profiles', () => {
  const profile = new GuiProfile();
  GUIProfiles.register('gui-api-profile-duplicate', profile);

  assert.throws(() => GUIProfiles.register('gui-api-profile-duplicate', new GuiProfile()), /already registered|duplicate/i);
  assert.throws(() => GUIProfiles.get('gui-api-profile-missing'), /unknown|not found/i);
});

test('GUI.setOwnProfile_assigns_and_returns_clone', () => {
  const shared = GUIProfiles.get('button');
  const control = new GUI();
  control.setProfile(shared);
  const own = control.setOwnProfile();

  assert.equal(control.getProfile(), own);
  assert.notEqual(own, shared);
  own.textColor.g = 0.17;
  assert.notEqual(shared.textColor.g, 0.17);

  const explicit = control.setOwnProfile(GUIProfiles.get('text'));
  assert.equal(control.getProfile(), explicit);
  assert.notEqual(explicit, GUIProfiles.get('text'));
});

test('GUI._emitCommands_keeps_stable_id_bounds_clip_and_profile', () => {
  const parent = new GUI({ x: 10, y: 20, width: 300, height: 200 });
  const child = new GUI({ x: 4, y: 5, width: 50, height: 30 });
  const profile = new GuiProfile({ normalColor: { r: 0.8, g: 0.2, b: 0.1, a: 1 } });
  parent.addControl(child);
  child.setProfile(profile).setClipToBounds(true);

  const commands = [];
  child._emitCommands(commands, null, { x: 0, y: 0, width: 30, height: 30 });

  assert.equal(commands.length, 1);
  assert.equal(commands[0].kind, GuiControlKind.Control);
  assert.equal(commands[0].id, child.id);
  assert.deepEqual(commands[0].rect, { x: 14, y: 25, width: 50, height: 30 });
  assert.deepEqual(commands[0].clip, { x: 14, y: 25, width: 16, height: 5 });
  assert.deepEqual(commands[0].profile.normalColor, { r: 0.8, g: 0.2, b: 0.1, a: 1 });
  assert.notEqual(commands[0].profile, profile);
});

test('GUI._emitCommands_inherits_profile_for_controls_without_an_override', () => {
  const parent = new GUI({ width: 100, height: 100 });
  const child = new GUI({ width: 20, height: 20 });
  const profile = new GuiProfile({ textColor: { r: 0.1, g: 0.2, b: 0.3, a: 1 } });
  parent.addControl(child);
  parent.setProfile(profile);

  const commands = [];
  parent._emitCommands(commands);

  assert.equal(commands.length, 2);
  assert.equal(commands[1].id, child.id);
  assert.deepEqual(commands[1].profile.textColor, profile.textColor);
  assert.notEqual(commands[1].profile, profile);
});

test('package_exports_GUI_subpath_without_replacing_immediate_UI', async () => {
  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(packageJson.exports['./gui'], './src/gui/index.ts');
  assert.equal(packageJson.exports['./ui'], './src/ui/index.ts');
});

test('GuiScroll.clips_children_to_its_viewport', () => {
  const scroll = new GuiScroll({ x: 10, y: 20, width: 80, height: 50 });
  const child = new GUI({ x: 70, y: 40, width: 30, height: 30 });
  scroll.addControl(child);

  const commands = [];
  scroll._emitCommands(commands);

  assert.equal(commands[1].id, child.id);
  assert.equal(commands[1].parentId, scroll.id);
  assert.deepEqual(commands[1].clip, { x: 10, y: 20, width: 80, height: 50 });
  assert.deepEqual(commands[1].clips, [{ ownerId: scroll.id, rect: { x: 10, y: 20, width: 80, height: 50 } }]);
  assert.equal(scroll.getClipChildren(), true);
});

test('GUI.clipToBounds_does_not_clip_children_without_clipChildren', () => {
  const parent = new GUI({ x: 10, y: 20, width: 80, height: 50, clipToBounds: true });
  const child = new GUI({ x: 4, y: 5, width: 20, height: 10 });
  parent.addControl(child);
  const commands = [];
  parent._emitCommands(commands);

  assert.deepEqual(commands[0].clip, { x: 10, y: 20, width: 80, height: 50 });
  assert.equal(commands[1].clip, null);
  assert.deepEqual(commands[1].clips, []);
});

test('GuiNativeBridge encodes parent IDs and hierarchical clip bounds', () => {
  const calls = [];
  const api = {
    command: (...args) => { calls.push(['command', ...args]); return 1; },
    scratchReset: () => calls.push(['scratchReset']),
    scratchPushF64: (value) => calls.push(['scratchPushF64', value]),
    scratchCommand: (...args) => { calls.push(['scratchCommand', ...args]); return 1; },
    response: () => 0,
    responseText: () => '',
    eventCount: () => 0,
    eventField: () => 0,
    isAvailable: () => 1,
    wantsInput: () => 0,
  };
  const scroll = new GuiScroll({ x: 10, y: 20, width: 80, height: 50 });
  const child = new GUI({ x: 4, y: 5, width: 20, height: 10 });
  scroll.addControl(child);
  const commands = [];
  scroll._emitCommands(commands);

  new GuiNativeBridge(api).submit(commands);
  const resets = calls.reduce((indices, call, index) => (call[0] === 'scratchReset' ? [...indices, index] : indices), []);
  const childStart = resets[1] + 1;
  const childValues = calls.slice(childStart).filter(([kind]) => kind === 'scratchPushF64').map(([, value]) => value);
  assert.equal(childValues[52], scroll.id);
  assert.equal(childValues[53], 1);
  assert.deepEqual(childValues.slice(54, 59), [scroll.id, 10, 20, 80, 50]);
  assert.equal(childValues[59], 0);
});

test('GuiRadioButton.enforces_one_selection_per_group', () => {
  const parent = new GUI();
  const first = new GuiRadioButton();
  const second = new GuiRadioButton();
  const initialCommands = [];
  second._emitCommands(initialCommands);
  assert.equal(initialCommands[0].kind, GuiControlKind.RadioButton);
  first.setGroup('inventory');
  second.setGroup('inventory');
  parent.addControl(first);
  parent.addControl(second);

  first.setValue(true);
  second.setValue(true);
  assert.equal(first.getValue(), false);
  assert.equal(second.getValue(), true);
  assert.equal(second.getGroup(), 'inventory');
});

test('GuiTextEdit.applies_length_password_and_numeric_options', () => {
  const edit = new GuiTextEdit();
  edit.setMaxLength(5).setPassword(true).setNumbersOnly(true);
  edit.setText('12a34567');

  assert.equal(edit.getText(), '12345');
  assert.equal(edit.getMaxLength(), 5);
  assert.equal(edit.isPassword(), true);
  assert.equal(edit.isNumbersOnly(), true);
  edit.selectAll();
  assert.deepEqual(edit.getSelection(), { start: 0, end: 5 });
  edit.clear();
  assert.equal(edit.getText(), '');
  assert.deepEqual(edit.getSelection(), { start: 0, end: 0 });
});

test('GuiTextEdit.emits_selection_and_editing_options', () => {
  const edit = new GuiTextEdit();
  edit.setMaxLength(8).setPassword(true).setNumbersOnly(true).setText('23456').selectAll();
  const commands = [];
  edit._emitCommands(commands);

  assert.deepEqual(commands[0].values, [1, 1, 8, 0, 5]);
  assert.equal(commands[0].text, '23456');
});

test('GuiSlider.clamps_and_preserves_value_by_control_id', () => {
  const parent = new GUI();
  const first = new GuiSlider();
  const second = new GuiSlider();
  parent.addControl(first);
  parent.addControl(second);
  first.setRange(10, 50).setValue(75);
  second.setRange(-1, 1).setValue(-0.5);
  const firstId = first.id;
  const revision = first._captureValueRevision();

  first.setValue(35);
  first._applyNativeValue(20, revision);
  first.bringToFront();

  assert.equal(first.getValue(), 35);
  assert.equal(second.getValue(), -0.5);
  assert.equal(first.id, firstId);
  assert.deepEqual(parent.getControls(), [second, first]);
});

test('native_value_changes_dispatch_onChange_once_with_typed_target', () => {
  const changes = [];
  class TrackingSlider extends GuiSlider {
    onChange(event) { changes.push([event.target.id, event.currentTarget.id, event.type]); }
  }
  const manager = new GUIManager({});
  const slider = new TrackingSlider();
  manager.addControl(slider);
  const commandRevision = slider._captureValueRevision();

  slider._applyNativeValue(0.6, commandRevision);
  slider._applyNativeValue(0.9, commandRevision);

  assert.equal(slider.getValue(), 0.6);
  assert.deepEqual(changes, [[slider.id, slider.id, GUIEventType.Change]]);
});

test('planned_layout_controls_expose_configuration_and_validate_sizes', () => {
  const window = new GuiWindow();
  const panel = new GuiPanel();
  const border = new GuiBitmapBorder();
  const stretch = new GuiStretch();
  const frameSet = new GuiFrameSet();

  window.setTitle('Inventory').setMovable(false).setResizable(true).setClosable(false);
  assert.equal(window.getTitle(), 'Inventory');
  assert.equal(window.isMovable(), false);
  assert.equal(window.isResizable(), true);
  assert.equal(window.isClosable(), false);
  border.setTiled(true);
  assert.equal(border.isTiled(), true);
  stretch.setClientSize(640, 480);
  assert.deepEqual(stretch.getClientSize(), { width: 640, height: 480 });
  frameSet.setColumnCount(3).setRowCount(2).setSplitterWidth(4);
  assert.deepEqual(frameSet.getGridSize(), { columns: 3, rows: 2 });
  assert.equal(frameSet.getSplitterWidth(), 4);
  assert.throws(() => frameSet.setColumnCount(0), RangeError);
  assert.ok(panel instanceof GUI);
});

test('planned_button_and_text_controls_keep_text_and_scroll_modes', () => {
  const button = new GuiButton();
  const checkBox = new GuiCheckBox();
  const bitmapButton = new GuiBitmapButton();
  const text = new GuiText();
  const multiline = new GuiMLText();
  const edit = new GuiMLTextEdit();
  const editSlider = new GuiTextEditSlider();
  const scroll = new GuiScroll();

  button.setText('Open');
  text.setText('Name');
  multiline.setText('First line\nSecond line');
  edit.setText('Multiline input').setMaxLength(20);
  editSlider.setRange(0, 100).setValue(42);
  scroll.setHorizontalScrollBarMode('alwaysOff').setVerticalScrollBarMode('alwaysOn').setScrollBarThickness(12);

  assert.equal(button.getText(), 'Open');
  assert.equal(text.getText(), 'Name');
  assert.equal(multiline.getText(), 'First line\nSecond line');
  assert.equal(edit.getText(), 'Multiline input');
  assert.equal(editSlider.getValue(), 42);
  assert.equal(checkBox.getValue(), false);
  assert.equal(bitmapButton instanceof GuiButtonBase, true);
  assert.equal(scroll.getHorizontalScrollBarMode(), 'alwaysOff');
  assert.equal(scroll.getVerticalScrollBarMode(), 'alwaysOn');
  assert.equal(scroll.getScrollBarThickness(), 12);
});

test('GuiTextEditSlider.keeps_numeric_and_edit_options_in_commands', () => {
  const editSlider = new GuiTextEditSlider();
  editSlider.setRange(0, 100).setValue(42).setPassword(true).setMaxLength(4);
  const commands = [];
  editSlider._emitCommands(commands);

  assert.deepEqual(commands[0].values.slice(0, 6), [42, 0, 100, 1, 0, 4]);
  assert.equal(commands[0].text, '42');
});

test('every_documented_gui_class_extends_GUI', () => {
  const classes = [
    GuiWindow, GuiPanel, GuiScroll, GuiBitmapBorder, GuiStretch, GuiFrameSet,
    GuiButtonBase, GuiButton, GuiCheckBox, GuiRadioButton, GuiBitmapButton,
    GuiText, GuiMLText, GuiTextEdit, GuiMLTextEdit, GuiTextEditSlider, GuiSlider,
    GuiArray, GuiPopUpMenu, GuiPopUpEdit, GuiTreeView, GuiTextList, GuiTab, GuiMenu, GuiContextMenu,
    GuiBitmap, GuiShowImg, GuiProgress, GuiDrawingPanel,
  ];
  for (const Control of classes) assert.equal(Control.prototype instanceof GUI, true, `${Control.name} must extend GUI`);
});

test('GuiBitmapButton_keeps_normal_hover_pressed_and_disabled_textures', () => {
  const textures = {
    normal: { handle: 11, width: 16, height: 16 },
    hover: { handle: 12, width: 16, height: 16 },
    pressed: { handle: 13, width: 16, height: 16 },
    disabled: { handle: 14, width: 16, height: 16 },
  };
  const button = new GuiBitmapButton();
  button.setTextures(textures);

  assert.deepEqual(button.getTextures(), textures);
  assert.notEqual(button.getTextures(), textures);
});

test('GuiPopUpMenu.preserves_selected_id_and_text', () => {
  const menu = new GuiPopUpMenu();
  menu.add('Continue', 'continue');
  menu.add('Quit', 'quit');
  menu.setSelected('quit');

  assert.equal(menu.getSelected(), 'quit');
  assert.equal(menu.getSelectedText(), 'Quit');
  assert.throws(() => menu.add('Duplicate', 'quit'), /duplicate|already exists/i);
  menu.clear();
  assert.equal(menu.getSelected(), null);
  assert.equal(menu.getSelectedText(), null);
});

test('GuiArray.keeps_item_strings_as_typed_entries_without_packing_them_into_text', () => {
  const menu = new GuiPopUpMenu();
  menu.add('First option', 1);
  menu.add('Second option', 2);
  menu.setSelected(2);
  const commands = [];
  menu._emitCommands(commands);

  assert.deepEqual(menu.getItems(), [
    { id: 1, label: 'First option' },
    { id: 2, label: 'Second option' },
  ]);
  assert.equal(commands[0].text, 'Second option');
  assert.equal(commands[0].text.includes('\n'), false);
});

test('GuiTreeView.addNodeByPath_builds_and_selects_path', () => {
  const tree = new GuiTreeView();
  const leaf = tree.addNodeByPath('Inventory/Weapons/Sword', 23);

  assert.equal(leaf.label, 'Sword');
  assert.equal(leaf.value, 23);
  assert.equal(tree.getSelected(), leaf);
  assert.equal(tree.getSelectedPath(), 'Inventory/Weapons/Sword');
  assert.equal(tree.getRootNodes()[0].children[0].children[0], leaf);
  assert.throws(() => tree.addNodeByPath(''), /empty|path/i);
});

test('GuiTreeView.rejects_invalid_values_and_bounded_path_overflow', () => {
  const tree = new GuiTreeView();
  assert.throws(() => tree.addNode('Invalid', Number.NaN), RangeError);
  assert.throws(() => tree.addNodeByPath('A/'.repeat(128) + 'Leaf'), /segments/i);
  assert.throws(() => tree.addNodeByPath('X'.repeat(GUI_TREE_MAX_PATH_LENGTH + 1)), /characters/i);
  assert.equal(tree.getRootNodes().length, 0);
});

test('GuiTab.selects_one_child_page', () => {
  const tabs = new GuiTab();
  const first = tabs.addTab('World', 'world');
  const second = tabs.addTab('Settings', 'settings');

  assert.equal(tabs.getSelected(), 'world');
  assert.equal(first.isVisible(), true);
  assert.equal(second.isVisible(), false);
  tabs.setSelected('settings');
  assert.equal(tabs.getSelected(), 'settings');
  assert.equal(first.isVisible(), false);
  assert.equal(second.isVisible(), true);
  assert.equal(tabs.getTab('settings'), second);
});

test('GuiTextList.selects_rows_by_id', () => {
  const list = new GuiTextList();
  list.addRow(10, 'Alpha');
  list.addRow(20, 'Beta');
  list.setSelected(20);
  list.addRow(30, 'Gamma');

  assert.equal(list.getSelected(), 20);
  assert.equal(list.getSelectedText(), 'Beta');
  const commands = [];
  list._emitCommands(commands);
  assert.deepEqual(commands[0].values, [3, 1]);
  assert.equal(list.removeRow(20), true);
  assert.equal(list.getSelected(), null);
  list.clearRows();
  assert.equal(list.getRowCount(), 0);
});

test('GuiPopUpEdit.preserves_typed_editable_text', () => {
  const popup = new GuiPopUpEdit();
  popup.setText('Custom text');
  popup.add('One', 'one');
  popup.setSelected('one');

  assert.equal(popup.getSelected(), 'one');
  assert.equal(popup.getText(), 'Custom text');
  const commands = [];
  popup._emitCommands(commands);
  assert.equal(commands[0].text, 'Custom text');
});

test('GuiContextMenu.opens_on_secondary_click_and_bubbles_action', () => {
  const calls = [];
  class Host extends GUI {
    onAction(event) { calls.push([event.target, event.currentTarget]); }
  }
  const manager = new GUIManager({});
  const host = new Host();
  const menu = new GuiContextMenu();
  let selected = 0;
  host.addControl(menu);
  menu.add('Delete', 'delete', () => selected++);
  manager.addControl(host);

  assert.equal(menu.isOpen(), false);
  assert.equal(menu.openAt(40, 50, 0), false);
  assert.equal(menu.openAt(40, 50, 1), true);
  assert.equal(menu.isOpen(), true);
  assert.deepEqual(menu.getPosition(), { x: 40, y: 50 });
  assert.equal(menu.activateItem('delete'), true);
  assert.equal(selected, 1);
  assert.deepEqual(calls, [[menu, host]]);
  assert.equal(menu.isOpen(), false);
});

test('GuiProgress.clamps_to_unit_interval', () => {
  const progress = new GuiProgress();
  progress.setValue(2);
  assert.equal(progress.getValue(), 1);
  progress.setValue(-0.5);
  assert.equal(progress.getValue(), 0);
});

test('GuiDrawingPanel.preserves_typed_primitives_and_clear_order', () => {
  const panel = new GuiDrawingPanel({ x: 10, y: 20, width: 100, height: 80 });
  const texture = { handle: 77, width: 8, height: 8 };
  panel
    .drawLine({ x: 0, y: 1 }, { x: 2, y: 3 }, { r: 1, g: 0, b: 0, a: 1 })
    .drawRect({ x: 3, y: 4, width: 5, height: 6 }, { r: 0, g: 1, b: 0, a: 1 })
    .drawCircle({ x: 7, y: 8 }, 9, { r: 0, g: 0, b: 1, a: 1 })
    .drawText('score', { x: 10, y: 11 }, 12, { r: 1, g: 1, b: 1, a: 1 })
    .drawImage(texture, { x: 13, y: 14, width: 15, height: 16 })
    .drawPolyline([{ x: 1, y: 1 }, { x: 2, y: 2 }], { r: 1, g: 1, b: 0, a: 1 })
    .drawPolygon([{ x: 1, y: 1 }, { x: 4, y: 1 }, { x: 2, y: 5 }], { r: 0, g: 1, b: 1, a: 1 });
  const beforeClear = panel.getDrawingCommands();
  assert.deepEqual(beforeClear.map((item) => item.kind), ['line', 'rect', 'circle', 'text', 'image', 'polyline', 'polygon']);
  assert.equal(beforeClear[4].texture, texture);
  assert.equal(panel.getClipToBounds(), true);
  panel.clearDrawing().drawRect({ x: 0, y: 0, width: 1, height: 1 }, { r: 1, g: 1, b: 1, a: 1 });
  assert.deepEqual(panel.getDrawingCommands().map((item) => item.kind), ['rect']);
});

test('GuiBitmap_and_GuiShowImg_keep_transform_and_tint_values', () => {
  const texture = { handle: 99, width: 32, height: 24, isLoaded: true };
  const tint = { r: 0.4, g: 0.5, b: 0.6, a: 0.7 };
  for (const image of [new GuiBitmap(), new GuiShowImg()]) {
    image.setTexture(texture).setTint(tint).setOpacity(0.5).setRotation(30).setZoom(2);
    assert.equal(image.getTexture(), texture);
    assert.deepEqual(image.getTint(), tint);
    assert.equal(image.getOpacity(), 0.5);
    assert.equal(image.getRotation(), 30);
    assert.equal(image.getZoom(), 2);
    assert.throws(() => image.setOpacity(2), RangeError);
  }
});

test('gui_manager_encodes_typed_commands_and_reads_GUI_domain_responses', () => {
  const nativeCalls = [];
  const responseFields = { 0: 0, 1: 1, 2: 0, 3: 0, 4: 0, 5: 0.75, 6: 1 };
  let slider;
  const bridge = new GuiNativeBridge({
    command: (...args) => { nativeCalls.push(['command', ...args]); return 1; },
    scratchReset: () => nativeCalls.push(['scratchReset']),
    scratchPushF64: (value) => nativeCalls.push(['scratchPushF64', value]),
    scratchCommand: (...args) => { nativeCalls.push(['scratchCommand', ...args]); return 1; },
    response: (id, field) => { assert.equal(id, slider.id); return responseFields[field] ?? 0; },
    responseText: (id) => { assert.equal(id, slider.id); return ''; },
    eventCount: () => 0,
    eventField: () => 0,
    isAvailable: () => 1,
    wantsInput: () => 0,
  });
  const manager = new GUIManager({}, bridge);
  slider = new GuiSlider({ x: 10, y: 20, width: 100, height: 18 });
  slider.setRange(0, 1).setValue(0.25);
  manager.addControl(slider);

  manager.renderFrame();
  manager.updateFrame(1 / 60);

  assert.deepEqual(nativeCalls.find(([kind]) => kind === 'command'), [
    'command', GuiOpcode.Control, slider.id, 10, 20, 100, 18, '',
  ]);
  assert.ok(nativeCalls.some(([kind]) => kind === 'scratchCommand' && kind === 'scratchCommand'));
  assert.equal(slider.getValue(), 0.75);
});

test('gui_manager_registers_only_loaded_textures_owned_by_its_game', () => {
  const context = GameContext.create();
  context.markReady();
  const registrations = [];
  const game = { ui: { registerTexture: (texture) => registrations.push(texture) } };
  bindGameContext(game, context);
  const owned = { isLoaded: true, handleValue: 123, dispose() {} };
  const unloaded = { isLoaded: false, handleValue: 456, dispose() {} };
  const foreign = { isLoaded: true, handleValue: 789, dispose() {} };
  context.register(owned);
  context.register(unloaded);
  const submitted = [];
  const manager = new GUIManager(game, {
    isAvailable: () => true,
    submit: (commands) => submitted.push(...commands),
    response: () => ({ present: false }),
    events: () => [],
    wantsPointerInput: () => false,
    wantsKeyboardInput: () => false,
  });
  try {
    const valid = new GuiBitmap({ width: 16, height: 16 }).setTexture(owned);
    const invalid = new GuiBitmap({ x: 20, width: 16, height: 16 }).setTexture(foreign);
    const notLoaded = new GuiBitmap({ x: 40, width: 16, height: 16 }).setTexture(unloaded);
    manager.addControl(valid);
    manager.addControl(invalid);
    manager.addControl(notLoaded);
    manager.renderFrame();

    assert.equal(submitted.find((command) => command.id === valid.id).values[7], 123);
    assert.equal(submitted.find((command) => command.id === invalid.id).values[7], 0);
    assert.equal(submitted.find((command) => command.id === notLoaded.id).values[7], 0);
    assert.deepEqual(registrations, [owned]);
  } finally {
    manager.dispose();
    context.dispose();
  }
});

test('gui_manager_drops_stale_responses_for_hidden_controls', () => {
  let actions = 0;
  const button = new (class extends GuiButton { onAction() { actions++; } })({ width: 40, height: 20 });
  const manager = new GUIManager({}, {
    isAvailable: () => true,
    submit() {},
    response: () => ({ present: true, changed: true, clicked: true, value: 1, text: '' }),
    events: () => [{ type: GUIEventType.Action, controlId: button.id, globalX: 0, globalY: 0, localX: 0, localY: 0, key: 0, button: 0, wheelX: 0, wheelY: 0, modifiers: 0 }],
    wantsPointerInput: () => false,
    wantsKeyboardInput: () => false,
  });
  manager.addControl(button);
  manager.renderFrame();
  button.hide();
  manager.updateFrame(1 / 60);
  assert.equal(actions, 0);
  manager.dispose();
});

test('gui_manager_skips_all_retained_work_when_the_platform_is_unavailable', () => {
  let submits = 0;
  let eventReads = 0;
  const button = new (class extends GuiButton { onAction() { throw new Error('unavailable GUI dispatched an event'); } })({ width: 40, height: 20 });
  const manager = new GUIManager({}, {
    isAvailable: () => false,
    submit: () => { submits++; },
    response: () => ({ present: false }),
    events: () => { eventReads++; return []; },
    wantsPointerInput: () => false,
    wantsKeyboardInput: () => false,
  });
  manager.addControl(button);
  manager.renderFrame();
  manager.updateFrame(1 / 60);
  assert.equal(manager.isAvailable(), false);
  assert.equal(submits, 0);
  assert.equal(eventReads, 0);
  manager.dispose();
});

test('gui_opcodes_match_native_rust_constants', async () => {
  const typescriptOpcodes = await readFile(new URL('../src/gui/opcodes.ts', import.meta.url), 'utf8');
  const rustCommands = await readFile(new URL('../native/shared/src/gui/commands.rs', import.meta.url), 'utf8');
  const rustResponses = await readFile(new URL('../native/shared/src/gui/responses.rs', import.meta.url), 'utf8');

  const parseObject = (source, name) => {
    const match = source.match(new RegExp(`export const ${name} = \\{([\\s\\S]*?)\\} as const`));
    assert.ok(match, `missing TypeScript ${name}`);
    return Object.fromEntries([...match[1].matchAll(/([A-Za-z][A-Za-z0-9]*):\s*(\d+)/g)].map((entry) => [entry[1], Number(entry[2])]));
  };
  const parseEnum = (source, name) => {
    const match = source.match(new RegExp(`pub enum ${name}\\s*\\{([^}]+)\\}`));
    assert.ok(match, `missing Rust ${name}`);
    return Object.fromEntries([...match[1].matchAll(/([A-Za-z][A-Za-z0-9]*)\s*=\s*(\d+)/g)].map((entry) => [entry[1], Number(entry[2])]));
  };

  assert.deepEqual(parseObject(typescriptOpcodes, 'GuiOpcode'), parseEnum(rustCommands, 'GuiOpcode'));
  assert.deepEqual(parseObject(typescriptOpcodes, 'GUIEventType'), parseEnum(rustResponses, 'GuiEventType'));
  assert.deepEqual(parseObject(typescriptOpcodes, 'GuiEventField'), parseEnum(rustResponses, 'GuiEventField'));
  assert.equal(GuiOpcode.Control, 1);
  assert.equal(GuiEventField.ControlId, 1);
  assert.equal(GUIEventType.KeyUp, 13);
});
