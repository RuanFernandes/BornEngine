import { Collision, Colors, Game, Key, Mathf } from '@bornengine/engine';

const SCREEN_WIDTH = 800;
const SCREEN_HEIGHT = 450;
const PADDLE_WIDTH = 15;
const PADDLE_HEIGHT = 80;
const PADDLE_SPEED = 300;
const BALL_RADIUS = 8;
const BALL_SPEED = 250;
const PADDLE_MARGIN = 30;

const game = new Game({
  window: { width: SCREEN_WIDTH, height: SCREEN_HEIGHT, title: 'Pong' },
  targetFps: 60,
});
const controls = game.input.createActionMap();
controls.bindAction('pause', { kind: 'key', key: Key.P });

let leftPaddleY = SCREEN_HEIGHT / 2 - PADDLE_HEIGHT / 2;
let rightPaddleY = SCREEN_HEIGHT / 2 - PADDLE_HEIGHT / 2;
let ballX = SCREEN_WIDTH / 2;
let ballY = SCREEN_HEIGHT / 2;
let ballVelX = BALL_SPEED;
let ballVelY = BALL_SPEED * 0.5;
let leftScore = 0;
let rightScore = 0;
let paused = false;

function resetBall(direction: number): void {
  ballX = SCREEN_WIDTH / 2;
  ballY = SCREEN_HEIGHT / 2;
  ballVelX = BALL_SPEED * direction;
  ballVelY = BALL_SPEED * 0.5 * (Math.random() > 0.5 ? 1 : -1);
}

function update(deltaTime: number): void {
  if (controls.wasPressed('pause')) paused = !paused;
  if (paused) return;

  if (game.input.isKeyDown(Key.W)) leftPaddleY -= PADDLE_SPEED * deltaTime;
  if (game.input.isKeyDown(Key.S)) leftPaddleY += PADDLE_SPEED * deltaTime;
  leftPaddleY = Mathf.clamp(leftPaddleY, 0, SCREEN_HEIGHT - PADDLE_HEIGHT);

  if (game.input.isKeyDown(Key.UP)) rightPaddleY -= PADDLE_SPEED * deltaTime;
  if (game.input.isKeyDown(Key.DOWN)) rightPaddleY += PADDLE_SPEED * deltaTime;
  rightPaddleY = Mathf.clamp(rightPaddleY, 0, SCREEN_HEIGHT - PADDLE_HEIGHT);

  ballX += ballVelX * deltaTime;
  ballY += ballVelY * deltaTime;
  if (ballY - BALL_RADIUS <= 0) { ballY = BALL_RADIUS; ballVelY = -ballVelY; }
  if (ballY + BALL_RADIUS >= SCREEN_HEIGHT) {
    ballY = SCREEN_HEIGHT - BALL_RADIUS;
    ballVelY = -ballVelY;
  }

  const leftPaddle = { x: PADDLE_MARGIN, y: leftPaddleY, width: PADDLE_WIDTH, height: PADDLE_HEIGHT };
  const rightPaddle = {
    x: SCREEN_WIDTH - PADDLE_MARGIN - PADDLE_WIDTH,
    y: rightPaddleY,
    width: PADDLE_WIDTH,
    height: PADDLE_HEIGHT,
  };
  const ballBounds = { x: ballX - BALL_RADIUS, y: ballY - BALL_RADIUS, width: BALL_RADIUS * 2, height: BALL_RADIUS * 2 };

  if (Collision.checkRectangles(ballBounds, leftPaddle) && ballVelX < 0) {
    ballVelX = -ballVelX;
    ballVelY = BALL_SPEED * ((ballY - leftPaddleY) / PADDLE_HEIGHT - 0.5) * 2;
  }
  if (Collision.checkRectangles(ballBounds, rightPaddle) && ballVelX > 0) {
    ballVelX = -ballVelX;
    ballVelY = BALL_SPEED * ((ballY - rightPaddleY) / PADDLE_HEIGHT - 0.5) * 2;
  }

  if (ballX < 0) { rightScore += 1; resetBall(1); }
  if (ballX > SCREEN_WIDTH) { leftScore += 1; resetBall(-1); }
}

function render(): void {
  const renderer = game.renderer;
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

  renderer.drawRectangle({ x: PADDLE_MARGIN, y: leftPaddleY, width: PADDLE_WIDTH, height: PADDLE_HEIGHT }, Colors.WHITE);
  renderer.drawRectangle({
    x: SCREEN_WIDTH - PADDLE_MARGIN - PADDLE_WIDTH,
    y: rightPaddleY,
    width: PADDLE_WIDTH,
    height: PADDLE_HEIGHT,
  }, Colors.WHITE);
  renderer.drawCircle({ x: ballX, y: ballY }, BALL_RADIUS, Colors.WHITE);

  const leftText = leftScore.toString();
  const rightText = rightScore.toString();
  renderer.drawText(leftText, { x: SCREEN_WIDTH / 4 - renderer.measureText(leftText, 40) / 2, y: 20 }, 40, Colors.WHITE);
  renderer.drawText(rightText, { x: 3 * SCREEN_WIDTH / 4 - renderer.measureText(rightText, 40) / 2, y: 20 }, 40, Colors.WHITE);
  if (paused) renderer.drawText('PAUSED', { x: SCREEN_WIDTH / 2 - 55, y: SCREEN_HEIGHT / 2 - 15 }, 30, Colors.LIGHTGRAY);
}

game.run({ update, render, onStop: () => game.dispose() });
