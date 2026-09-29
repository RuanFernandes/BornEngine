import { Collision, Colors, Game, Key, Mathf, Vector2D } from '@bornengine/engine';
import type { Color, Rect } from '@bornengine/engine';

// Constants
const SCREEN_WIDTH = 800;
const SCREEN_HEIGHT = 600;
const PLAYER_WIDTH = 40;
const PLAYER_HEIGHT = 30;
const PLAYER_SPEED = 350;
const BULLET_WIDTH = 4;
const BULLET_HEIGHT = 12;
const BULLET_SPEED = 600;
const BULLET_COOLDOWN = 0.12;
const MAX_BULLETS = 50;
const MAX_ENEMIES = 30;
const MAX_PARTICLES = 200;
const MAX_STARS = 100;
const ENEMY_WIDTH = 32;
const ENEMY_HEIGHT = 24;

// Types
interface Bullet {
  position: Vector2D;
  active: boolean;
}

interface Enemy {
  position: Vector2D;
  hp: number;
  speed: number;
  active: boolean;
  kind: number; // 0=basic, 1=fast, 2=tank
}

interface Particle {
  position: Vector2D;
  velocity: Vector2D;
  life: number;
  maxLife: number;
  color: Color;
  active: boolean;
}

interface Star {
  position: Vector2D;
  speed: number;
  brightness: number;
}

// Game state
let playerPosition = new Vector2D(SCREEN_WIDTH / 2, SCREEN_HEIGHT - 80);
let bulletCooldown = 0;
let score = 0;
let lives = 3;
let wave = 1;
let waveTimer = 0;
let enemiesSpawned = 0;
let enemiesPerWave = 5;
let gameOver = false;

// Entity pools
const bullets: Bullet[] = [];
for (let i = 0; i < MAX_BULLETS; i++) {
  bullets.push({ position: Vector2D.zero(), active: false });
}

const enemies: Enemy[] = [];
for (let i = 0; i < MAX_ENEMIES; i++) {
  enemies.push({ position: Vector2D.zero(), hp: 0, speed: 0, active: false, kind: 0 });
}

const particles: Particle[] = [];
for (let i = 0; i < MAX_PARTICLES; i++) {
  particles.push({ position: Vector2D.zero(), velocity: Vector2D.zero(), life: 0, maxLife: 0, color: Colors.WHITE, active: false });
}

// Scrolling star background
const stars: Star[] = [];
for (let i = 0; i < MAX_STARS; i++) {
  stars.push({
    position: new Vector2D(Mathf.randomFloat(0, SCREEN_WIDTH), Mathf.randomFloat(0, SCREEN_HEIGHT)),
    speed: Mathf.randomFloat(30, 150),
    brightness: Mathf.randomFloat(0.2, 1.0),
  });
}

function spawnBullet(position: Vector2D): void {
  for (let i = 0; i < MAX_BULLETS; i++) {
    if (!bullets[i].active) {
      bullets[i].position = position.clone();
      bullets[i].active = true;
      return;
    }
  }
}

function spawnEnemy(): void {
  for (let i = 0; i < MAX_ENEMIES; i++) {
    if (!enemies[i].active) {
      const kind = wave >= 3 ? Mathf.randomInt(0, 2) : (wave >= 2 ? Mathf.randomInt(0, 1) : 0);
      enemies[i].position = new Vector2D(Mathf.randomFloat(ENEMY_WIDTH, SCREEN_WIDTH - ENEMY_WIDTH), -ENEMY_HEIGHT);
      enemies[i].kind = kind;
      if (kind === 0) {
        enemies[i].hp = 1;
        enemies[i].speed = Mathf.randomFloat(80, 150);
      } else if (kind === 1) {
        enemies[i].hp = 1;
        enemies[i].speed = Mathf.randomFloat(150, 250);
      } else {
        enemies[i].hp = 3;
        enemies[i].speed = Mathf.randomFloat(50, 100);
      }
      enemies[i].active = true;
      return;
    }
  }
}

function spawnExplosion(position: Vector2D, count: number, color: Color): void {
  for (let n = 0; n < count; n++) {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (!particles[i].active) {
        const angle = Mathf.randomFloat(0, Math.PI * 2);
        const speed = Mathf.randomFloat(50, 200);
        particles[i].position = position.clone();
        particles[i].velocity = new Vector2D(Math.cos(angle) * speed, Math.sin(angle) * speed);
        particles[i].life = Mathf.randomFloat(0.3, 0.8);
        particles[i].maxLife = particles[i].life;
        particles[i].color = color;
        particles[i].active = true;
        break;
      }
    }
  }
}

function getEnemyColor(kind: number): Color {
  if (kind === 0) return { r: 230, g: 50, b: 50, a: 255 };
  if (kind === 1) return { r: 50, g: 230, b: 50, a: 255 };
  return { r: 100, g: 100, b: 230, a: 255 };
}

function resetGame(): void {
  playerPosition = new Vector2D(SCREEN_WIDTH / 2, SCREEN_HEIGHT - 80);
  score = 0;
  lives = 3;
  wave = 1;
  waveTimer = 0;
  enemiesSpawned = 0;
  enemiesPerWave = 5;
  gameOver = false;
  for (let i = 0; i < MAX_BULLETS; i++) bullets[i].active = false;
  for (let i = 0; i < MAX_ENEMIES; i++) enemies[i].active = false;
  for (let i = 0; i < MAX_PARTICLES; i++) particles[i].active = false;
}

class SpaceBlasterGame extends Game {
  protected override loop(dt: number): void {
    if (gameOver) {
      if (this.input.isKeyPressed(Key.ENTER)) {
        resetGame();
      }
    } else {
      // Player movement
      if (this.input.isKeyDown(Key.LEFT) || this.input.isKeyDown(Key.A)) {
        playerPosition.x -= PLAYER_SPEED * dt;
      }
      if (this.input.isKeyDown(Key.RIGHT) || this.input.isKeyDown(Key.D)) {
        playerPosition.x += PLAYER_SPEED * dt;
      }
      if (this.input.isKeyDown(Key.UP) || this.input.isKeyDown(Key.W)) {
        playerPosition.y -= PLAYER_SPEED * dt;
      }
      if (this.input.isKeyDown(Key.DOWN) || this.input.isKeyDown(Key.S)) {
        playerPosition.y += PLAYER_SPEED * dt;
      }
      playerPosition.x = Mathf.clamp(playerPosition.x, PLAYER_WIDTH / 2, SCREEN_WIDTH - PLAYER_WIDTH / 2);
      playerPosition.y = Mathf.clamp(playerPosition.y, PLAYER_HEIGHT / 2, SCREEN_HEIGHT - PLAYER_HEIGHT / 2);

      // Shooting
      bulletCooldown = bulletCooldown - dt;
      if (this.input.isKeyDown(Key.SPACE) && bulletCooldown <= 0) {
        spawnBullet(new Vector2D(playerPosition.x - 2, playerPosition.y - PLAYER_HEIGHT / 2));
        bulletCooldown = BULLET_COOLDOWN;
      }

      // Wave spawning
      waveTimer = waveTimer + dt;
      if (enemiesSpawned < enemiesPerWave && waveTimer > 0.6) {
        spawnEnemy();
        enemiesSpawned = enemiesSpawned + 1;
        waveTimer = 0;
      }

      // Check if wave is complete
      let activeEnemies = 0;
      for (let i = 0; i < MAX_ENEMIES; i++) {
        if (enemies[i].active) activeEnemies = activeEnemies + 1;
      }
      if (enemiesSpawned >= enemiesPerWave && activeEnemies === 0) {
        wave = wave + 1;
        enemiesPerWave = 5 + wave * 2;
        enemiesSpawned = 0;
        waveTimer = -1.5; // Pause before next wave
      }

      // Update bullets
      for (let i = 0; i < MAX_BULLETS; i++) {
        if (!bullets[i].active) continue;
        bullets[i].position.y -= BULLET_SPEED * dt;
        if (bullets[i].position.y < -BULLET_HEIGHT) {
          bullets[i].active = false;
        }
      }

      // Update enemies
      for (let i = 0; i < MAX_ENEMIES; i++) {
        if (!enemies[i].active) continue;
        enemies[i].position.y += enemies[i].speed * dt;

        // Off screen
        if (enemies[i].position.y > SCREEN_HEIGHT + ENEMY_HEIGHT) {
          enemies[i].active = false;
          lives = lives - 1;
          if (lives <= 0) gameOver = true;
          continue;
        }

        // Collision with player
        const playerRect: Rect = {
          x: playerPosition.x - PLAYER_WIDTH / 2,
          y: playerPosition.y - PLAYER_HEIGHT / 2,
          width: PLAYER_WIDTH,
          height: PLAYER_HEIGHT,
        };
        const enemyRect: Rect = {
          x: enemies[i].position.x - ENEMY_WIDTH / 2,
          y: enemies[i].position.y - ENEMY_HEIGHT / 2,
          width: ENEMY_WIDTH,
          height: ENEMY_HEIGHT,
        };
        if (Collision.checkRectangles(playerRect, enemyRect)) {
          spawnExplosion(enemies[i].position, 15, getEnemyColor(enemies[i].kind));
          enemies[i].active = false;
          lives = lives - 1;
          if (lives <= 0) gameOver = true;
          continue;
        }

        // Collision with bullets
        for (let j = 0; j < MAX_BULLETS; j++) {
          if (!bullets[j].active) continue;
          const bulletRect: Rect = {
            x: bullets[j].position.x - BULLET_WIDTH / 2,
            y: bullets[j].position.y - BULLET_HEIGHT / 2,
            width: BULLET_WIDTH,
            height: BULLET_HEIGHT,
          };
          if (Collision.checkRectangles(bulletRect, enemyRect)) {
            bullets[j].active = false;
            enemies[i].hp = enemies[i].hp - 1;
            if (enemies[i].hp <= 0) {
              spawnExplosion(enemies[i].position, 12, getEnemyColor(enemies[i].kind));
              enemies[i].active = false;
              score = score + (enemies[i].kind === 2 ? 30 : (enemies[i].kind === 1 ? 20 : 10));
            } else {
              spawnExplosion(bullets[j].position, 3, { r: 255, g: 255, b: 100, a: 255 });
            }
            break;
          }
        }
      }

      // Update particles
      for (let i = 0; i < MAX_PARTICLES; i++) {
        if (!particles[i].active) continue;
        particles[i].position.x += particles[i].velocity.x * dt;
        particles[i].position.y += particles[i].velocity.y * dt;
        particles[i].life = particles[i].life - dt;
        if (particles[i].life <= 0) {
          particles[i].active = false;
        }
      }
    }

    // Update stars (always, even on game over)
    for (let i = 0; i < MAX_STARS; i++) {
      stars[i].position.y += stars[i].speed * dt;
      if (stars[i].position.y > SCREEN_HEIGHT) {
        stars[i].position.y = 0;
        stars[i].position.x = Mathf.randomFloat(0, SCREEN_WIDTH);
      }
    }

    // Drawing
  }

  protected override render(): void {
    this.renderer.clear({ r: 5, g: 5, b: 15, a: 255 });

    // Stars
    for (let i = 0; i < MAX_STARS; i++) {
      const b = Math.floor(stars[i].brightness * 255);
      this.renderer.drawRectangle({ x: stars[i].position.x, y: stars[i].position.y, width: 2, height: 2 }, { r: b, g: b, b: b, a: 255 });
    }

    if (!gameOver) {
      // Player ship (triangle)
      this.renderer.drawTriangle(
        new Vector2D(playerPosition.x, playerPosition.y - PLAYER_HEIGHT / 2),
        new Vector2D(playerPosition.x - PLAYER_WIDTH / 2, playerPosition.y + PLAYER_HEIGHT / 2),
        new Vector2D(playerPosition.x + PLAYER_WIDTH / 2, playerPosition.y + PLAYER_HEIGHT / 2),
        { r: 50, g: 200, b: 255, a: 255 },
      );
      // Engine glow
      this.renderer.drawRectangle({ x: playerPosition.x - 4, y: playerPosition.y + PLAYER_HEIGHT / 2, width: 8, height: 6 }, { r: 255, g: 150, b: 0, a: 200 });

      // Bullets
      for (let i = 0; i < MAX_BULLETS; i++) {
        if (!bullets[i].active) continue;
        this.renderer.drawRectangle({ x: bullets[i].position.x - BULLET_WIDTH / 2, y: bullets[i].position.y - BULLET_HEIGHT / 2, width: BULLET_WIDTH, height: BULLET_HEIGHT }, { r: 255, g: 255, b: 100, a: 255 });
      }

      // Enemies
      for (let i = 0; i < MAX_ENEMIES; i++) {
        if (!enemies[i].active) continue;
        const color = getEnemyColor(enemies[i].kind);
        this.renderer.drawRectangle({ x: enemies[i].position.x - ENEMY_WIDTH / 2, y: enemies[i].position.y - ENEMY_HEIGHT / 2, width: ENEMY_WIDTH, height: ENEMY_HEIGHT }, color);
        // Cockpit
        this.renderer.drawRectangle({ x: enemies[i].position.x - 4, y: enemies[i].position.y - 4, width: 8, height: 8 }, { r: 200, g: 200, b: 200, a: 255 });
      }
    }

    // Particles
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (!particles[i].active) continue;
      const alpha = Math.floor((particles[i].life / particles[i].maxLife) * 255);
      const c = particles[i].color;
      this.renderer.drawRectangle({ x: particles[i].position.x - 2, y: particles[i].position.y - 2, width: 4, height: 4 }, { r: c.r, g: c.g, b: c.b, a: alpha });
    }

    // HUD
    this.renderer.drawText("SCORE: " + score.toString(), new Vector2D(10, 10), 20, Colors.WHITE);
    this.renderer.drawText("WAVE: " + wave.toString(), new Vector2D(SCREEN_WIDTH / 2 - 40, 10), 20, Colors.WHITE);

    // Lives
    for (let i = 0; i < lives; i++) {
      this.renderer.drawTriangle(
        new Vector2D(SCREEN_WIDTH - 30 - i * 25, 12),
        new Vector2D(SCREEN_WIDTH - 40 - i * 25, 28),
        new Vector2D(SCREEN_WIDTH - 20 - i * 25, 28),
        { r: 50, g: 200, b: 255, a: 255 },
      );
    }

    // Wave announcement
    if (waveTimer < 0) {
      const waveText = "WAVE " + wave.toString();
      this.renderer.drawText(waveText, new Vector2D(SCREEN_WIDTH / 2 - this.renderer.measureText(waveText, 40) / 2, SCREEN_HEIGHT / 2 - 20), 40, Colors.YELLOW);
    }

    // Game over screen
    if (gameOver) {
      this.renderer.drawText("GAME OVER", new Vector2D(SCREEN_WIDTH / 2 - this.renderer.measureText("GAME OVER", 60) / 2, SCREEN_HEIGHT / 2 - 60), 60, Colors.RED);
      const finalScore = "Score: " + score.toString();
      this.renderer.drawText(finalScore, new Vector2D(SCREEN_WIDTH / 2 - this.renderer.measureText(finalScore, 30) / 2, SCREEN_HEIGHT / 2 + 10), 30, Colors.WHITE);
      const restartText = "Press ENTER to restart";
      this.renderer.drawText(restartText, new Vector2D(SCREEN_WIDTH / 2 - this.renderer.measureText(restartText, 20) / 2, SCREEN_HEIGHT / 2 + 60), 20, Colors.LIGHTGRAY);
    }

  }
}

const game = new SpaceBlasterGame({ window: { width: SCREEN_WIDTH, height: SCREEN_HEIGHT, title: "Space Blaster" }, targetFps: 60 });

// Main game loop
game.run();
