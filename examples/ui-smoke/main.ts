import { clearBackground, initWindow, runGame } from "@bornengine/engine/core";
import { ui } from "@bornengine/engine/ui";
import { debugUi } from "@bornengine/engine/debug-ui";

let gain = 0.5;
let playerName = "Player";
let musicEnabled = true;
let applyCount = 0;

initWindow(960, 640, "BornEngine UI smoke");
runGame(() => {
  clearBackground({ r: 10, g: 13, b: 20, a: 255 });

  ui.beginWindow(100, "Settings", 24, 24, 360, 420);
  ui.label(106, "Audio and player controls");
  gain = ui.sliderFloat(101, "Gain", gain, 0, 1);
  musicEnabled = ui.checkbox(107, "Music enabled", musicEnabled);
  playerName = ui.textEditSingleline(103, "Player name", playerName);
  ui.paintRect(105, 0, 0, 80, 20, { r: 51, g: 77, b: 102, a: 255 });
  const applyPressed = ui.button(102, "Apply");
  ui.endWindow(100);

  if (applyPressed && playerName.length > 0) applyCount += 1;

  if (debugUi.isAvailable()) {
    debugUi.beginWindow(900, "Developer tools", 420, 24, 300, 180);
    debugUi.label(901, `Apply count: ${applyCount}`);
    debugUi.demoWindow(902);
    debugUi.endWindow(900);
  }

  if (ui.wantsPointerInput()) {
    // The game chooses which pointer-driven gameplay controls to suspend.
  }
  if (ui.wantsKeyboardInput()) {
    // The game chooses which keyboard-driven gameplay controls to suspend.
  }
});
