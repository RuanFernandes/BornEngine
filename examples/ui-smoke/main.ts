import { Game } from '@bornengine/engine';

const game = new Game({ window: { width: 960, height: 640, title: 'BornEngine UI sample' } });
let gain = 0.5;
let playerName = 'Player';
let musicEnabled = true;
let applyCount = 0;

game.run({
  update() {},
  render() {
    game.renderer.clear({ r: 10, g: 13, b: 20, a: 255 });
    game.ui.beginWindow(100, 'Settings', 24, 24, 360, 420);
    game.ui.label(106, 'Audio and player controls');
    gain = game.ui.sliderFloat(101, 'Gain', gain, 0, 1);
    musicEnabled = game.ui.checkbox(107, 'Music enabled', musicEnabled);
    playerName = game.ui.textEditSingleline(103, 'Player name', playerName);
    game.ui.paintRect(105, 0, 0, 80, 20, { r: 51, g: 77, b: 102, a: 255 });
    const applyPressed = game.ui.button(102, 'Apply');
    game.ui.endWindow(100);

    if (applyPressed && playerName.length > 0) applyCount += 1;

    if (game.debugUi.isAvailable()) {
      game.debugUi.beginWindow(900, 'Developer tools', 420, 24, 300, 180);
      game.debugUi.label(901, 'Apply count: ' + applyCount);
      game.debugUi.demoWindow(902);
      game.debugUi.endWindow(900);
    }

    if (game.ui.wantsPointerInput()) {
      // Suspend pointer-driven gameplay while the UI owns the pointer.
    }
    if (game.ui.wantsKeyboardInput()) {
      // Suspend keyboard-driven gameplay while a UI field is focused.
    }
  },
  onStop: () => game.dispose(),
});
