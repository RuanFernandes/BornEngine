import assert from 'node:assert/strict';
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

const { GUI, GUIManager, GUIEventType } = await import('../src/gui/index.ts');
const { GUIIdAllocator } = await import('../src/gui/types.ts');

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
