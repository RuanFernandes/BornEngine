import { Collision, Colors, Game, Key, Mathf, Vector2D } from '@bornengine/engine';
import type { InputActionMap } from '@bornengine/engine/input';

const SCREEN_WIDTH = 800;
const SCREEN_HEIGHT = 450;
const PADDLE_WIDTH = 15;
const PADDLE_HEIGHT = 80;
const PADDLE_SPEED = 300;
const BALL_RADIUS = 8;
const BALL_SPEED = 250;
const PADDLE_MARGIN = 30;

class PongGame extends Game {
  private readonly controls: InputActionMap;
  private readonly leftPaddle = new Vector2D(PADDLE_MARGIN, SCREEN_HEIGHT / 2 - PADDLE_HEIGHT / 2);
  private readonly rightPaddle = new Vector2D(
    SCREEN_WIDTH - PADDLE_MARGIN - PADDLE_WIDTH,
    SCREEN_HEIGHT / 2 - PADDLE_HEIGHT / 2,
  );
  private ballPosition = new Vector2D(SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2);
  private ballVelocity = new Vector2D(BALL_SPEED, BALL_SPEED * 0.5);
  private leftScore = 0;
  private rightScore = 0;
  private paused = false;

  constructor() {
    super({
      window: { width: SCREEN_WIDTH, height: SCREEN_HEIGHT, title: 'Pong' },
      targetFps: 60,
    });
    this.controls = this.input.createActionMap();
    this.controls.bindAction('pause', { kind: 'key', key: Key.P });
  }

  protected override loop(deltaTime: number): void {
    if (this.controls.wasPressed('pause')) this.paused = !this.paused;
    if (this.paused) return;

    if (this.input.isKeyDown(Key.W)) this.leftPaddle.y -= PADDLE_SPEED * deltaTime;
    if (this.input.isKeyDown(Key.S)) this.leftPaddle.y += PADDLE_SPEED * deltaTime;
    this.leftPaddle.y = Mathf.clamp(this.leftPaddle.y, 0, SCREEN_HEIGHT - PADDLE_HEIGHT);

    if (this.input.isKeyDown(Key.UP)) this.rightPaddle.y -= PADDLE_SPEED * deltaTime;
    if (this.input.isKeyDown(Key.DOWN)) this.rightPaddle.y += PADDLE_SPEED * deltaTime;
    this.rightPaddle.y = Mathf.clamp(this.rightPaddle.y, 0, SCREEN_HEIGHT - PADDLE_HEIGHT);

    this.ballPosition = this.ballPosition.add(this.ballVelocity.scale(deltaTime));
    if (this.ballPosition.y - BALL_RADIUS <= 0) {
      this.ballPosition.y = BALL_RADIUS;
      this.ballVelocity.y = -this.ballVelocity.y;
    }
    if (this.ballPosition.y + BALL_RADIUS >= SCREEN_HEIGHT) {
      this.ballPosition.y = SCREEN_HEIGHT - BALL_RADIUS;
      this.ballVelocity.y = -this.ballVelocity.y;
    }

    const ballBounds = {
      x: this.ballPosition.x - BALL_RADIUS,
      y: this.ballPosition.y - BALL_RADIUS,
      width: BALL_RADIUS * 2,
      height: BALL_RADIUS * 2,
    };
    if (Collision.checkRectangles(ballBounds, this.paddleBounds(this.leftPaddle)) && this.ballVelocity.x < 0) {
      this.ballVelocity.x = -this.ballVelocity.x;
      this.ballVelocity.y = BALL_SPEED * ((this.ballPosition.y - this.leftPaddle.y) / PADDLE_HEIGHT - 0.5) * 2;
    }
    if (Collision.checkRectangles(ballBounds, this.paddleBounds(this.rightPaddle)) && this.ballVelocity.x > 0) {
      this.ballVelocity.x = -this.ballVelocity.x;
      this.ballVelocity.y = BALL_SPEED * ((this.ballPosition.y - this.rightPaddle.y) / PADDLE_HEIGHT - 0.5) * 2;
    }

    if (this.ballPosition.x < 0) {
      this.rightScore += 1;
      this.resetBall(1);
    }
    if (this.ballPosition.x > SCREEN_WIDTH) {
      this.leftScore += 1;
      this.resetBall(-1);
    }
  }

  protected override render(): void {
    const renderer = this.renderer;
    renderer.clear(Colors.BLACK);
    const segments = 20;
    const segmentHeight = SCREEN_HEIGHT / (segments * 2);
    for (let index = 0; index < segments; index += 1) {
      renderer.drawRectangle({
        x: SCREEN_WIDTH / 2 - 1,
        y: index * segmentHeight * 2,
        width: 2,
        height: segmentHeight,
      }, Colors.DARKGRAY);
    }

    renderer.drawRectangle(this.paddleBounds(this.leftPaddle), Colors.WHITE);
    renderer.drawRectangle(this.paddleBounds(this.rightPaddle), Colors.WHITE);
    renderer.drawCircle(this.ballPosition, BALL_RADIUS, Colors.WHITE);

    const leftText = this.leftScore.toString();
    const rightText = this.rightScore.toString();
    renderer.drawText(leftText, new Vector2D(SCREEN_WIDTH / 4 - renderer.measureText(leftText, 40) / 2, 20), 40, Colors.WHITE);
    renderer.drawText(rightText, new Vector2D(3 * SCREEN_WIDTH / 4 - renderer.measureText(rightText, 40) / 2, 20), 40, Colors.WHITE);
    if (this.paused) {
      renderer.drawText('PAUSED', new Vector2D(SCREEN_WIDTH / 2 - 55, SCREEN_HEIGHT / 2 - 15), 30, Colors.LIGHTGRAY);
    }
  }

  private paddleBounds(position: Vector2D): { x: number; y: number; width: number; height: number } {
    return { x: position.x, y: position.y, width: PADDLE_WIDTH, height: PADDLE_HEIGHT };
  }

  private resetBall(direction: number): void {
    this.ballPosition = new Vector2D(SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2);
    this.ballVelocity = new Vector2D(
      BALL_SPEED * direction,
      BALL_SPEED * 0.5 * (Math.random() > 0.5 ? 1 : -1),
    );
  }
}

new PongGame().run();
