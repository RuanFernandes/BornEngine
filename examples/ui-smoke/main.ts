import { Game } from '@bornengine/engine';

class UiSmokeGame extends Game {
  protected override render(): void {
    this.renderer.clear({ r: 10, g: 13, b: 20, a: 255 });
    this.ui.beginWindow(100, 'Settings', 24, 24, 360, 420);
    this.ui.label(106, 'Audio and player controls');
    gain = this.ui.sliderFloat(101, 'Gain', gain, 0, 1);
    musicEnabled = this.ui.checkbox(107, 'Music enabled', musicEnabled);
    playerName = this.ui.textEditSingleline(103, 'Player name', playerName);
    this.ui.paintRect(105, 0, 0, 80, 20, { r: 51, g: 77, b: 102, a: 255 });
    const applyPressed = this.ui.button(102, 'Apply');
    this.ui.endWindow(100);

    if (applyPressed && playerName.length > 0) applyCount += 1;

    if (this.debugUi.isAvailable()) {
      this.debugUi.beginWindow(900, 'Developer tools', 420, 24, 300, 180);
      this.debugUi.label(901, 'Apply count: ' + applyCount);
      this.debugUi.demoWindow(902);
      this.debugUi.endWindow(900);
    }

    if (this.ui.wantsPointerInput()) {
      // Suspend pointer-driven gameplay while the UI owns the pointer.
    }
    if (this.ui.wantsKeyboardInput()) {
      // Suspend keyboard-driven gameplay while a UI field is focused.
    }
  }
}

const game = new UiSmokeGame({ window: { width: 960, height: 640, title: 'BornEngine UI sample' } });
let gain = 0.5;
let playerName = 'Player';
let musicEnabled = true;
let applyCount = 0;

game.run();
