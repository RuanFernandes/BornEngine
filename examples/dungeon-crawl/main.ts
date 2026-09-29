import { Colors, Game, Key, Mathf, Vector2D } from '@bornengine/engine';
import type { Camera2D, Color } from '@bornengine/engine';

// Constants
const SCREEN_WIDTH = 800;
const SCREEN_HEIGHT = 600;
const TILE_SIZE = 32;
const MAP_WIDTH = 50;
const MAP_HEIGHT = 50;
const MAX_ROOMS = 12;
const MIN_ROOM_SIZE = 4;
const MAX_ROOM_SIZE = 10;
const MAX_ENEMIES = 20;
const FOV_RADIUS = 8;

// Tile types
const TILE_WALL = 0;
const TILE_FLOOR = 1;
const TILE_STAIRS = 2;

// Entity types
interface Entity {
  position: Vector2D;
  hp: number;
  maxHp: number;
  attack: number;
  active: boolean;
  name: string;
}

interface Room {
  x: number;
  y: number;
  w: number;
  h: number;
}

// Game state
const map: number[] = [];
const visible: boolean[] = [];
const explored: boolean[] = [];
let player: Entity = { position: Vector2D.zero(), hp: 20, maxHp: 20, attack: 5, active: true, name: "Player" };
const enemies: Entity[] = [];
let floor = 1;
let turnCount = 0;
let message = "Welcome to the dungeon!";
let messageTimer = 3;

function tileAt(x: number, y: number): number {
  if (x < 0 || x >= MAP_WIDTH || y < 0 || y >= MAP_HEIGHT) return TILE_WALL;
  return map[y * MAP_WIDTH + x];
}

function setTile(x: number, y: number, tile: number): void {
  if (x >= 0 && x < MAP_WIDTH && y >= 0 && y < MAP_HEIGHT) {
    map[y * MAP_WIDTH + x] = tile;
  }
}

function isVisible(x: number, y: number): boolean {
  if (x < 0 || x >= MAP_WIDTH || y < 0 || y >= MAP_HEIGHT) return false;
  return visible[y * MAP_WIDTH + x];
}

function isExplored(x: number, y: number): boolean {
  if (x < 0 || x >= MAP_WIDTH || y < 0 || y >= MAP_HEIGHT) return false;
  return explored[y * MAP_WIDTH + x];
}

function showMessage(msg: string): void {
  message = msg;
  messageTimer = 3;
}

function generateDungeon(): void {
  // Fill with walls
  for (let i = 0; i < MAP_WIDTH * MAP_HEIGHT; i++) {
    map[i] = TILE_WALL;
    visible[i] = false;
    explored[i] = false;
  }

  // Clear enemies
  for (let i = 0; i < MAX_ENEMIES; i++) {
    if (i < enemies.length) {
      enemies[i].active = false;
    }
  }

  // Generate rooms
  const rooms: Room[] = [];
  for (let attempt = 0; attempt < 100 && rooms.length < MAX_ROOMS; attempt++) {
    const w = Mathf.randomInt(MIN_ROOM_SIZE, MAX_ROOM_SIZE);
    const h = Mathf.randomInt(MIN_ROOM_SIZE, MAX_ROOM_SIZE);
    const rx = Mathf.randomInt(1, MAP_WIDTH - w - 1);
    const ry = Mathf.randomInt(1, MAP_HEIGHT - h - 1);

    // Check overlap
    let overlaps = false;
    for (let r = 0; r < rooms.length; r++) {
      if (rx - 1 < rooms[r].x + rooms[r].w && rx + w + 1 > rooms[r].x &&
          ry - 1 < rooms[r].y + rooms[r].h && ry + h + 1 > rooms[r].y) {
        overlaps = true;
        break;
      }
    }
    if (overlaps) continue;

    // Carve room
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        setTile(rx + dx, ry + dy, TILE_FLOOR);
      }
    }
    rooms.push({ x: rx, y: ry, w, h });
  }

  // Connect rooms with corridors
  for (let i = 1; i < rooms.length; i++) {
    const cx1 = Math.floor(rooms[i - 1].x + rooms[i - 1].w / 2);
    const cy1 = Math.floor(rooms[i - 1].y + rooms[i - 1].h / 2);
    const cx2 = Math.floor(rooms[i].x + rooms[i].w / 2);
    const cy2 = Math.floor(rooms[i].y + rooms[i].h / 2);

    // Horizontal then vertical
    const startX = Math.min(cx1, cx2);
    const endX = Math.max(cx1, cx2);
    for (let x = startX; x <= endX; x++) {
      setTile(x, cy1, TILE_FLOOR);
    }
    const startY = Math.min(cy1, cy2);
    const endY = Math.max(cy1, cy2);
    for (let y = startY; y <= endY; y++) {
      setTile(cx2, y, TILE_FLOOR);
    }
  }

  // Place player in first room
  if (rooms.length > 0) {
    player.position.x = Math.floor(rooms[0].x + rooms[0].w / 2);
    player.position.y = Math.floor(rooms[0].y + rooms[0].h / 2);
  }

  // Place stairs in last room
  if (rooms.length > 1) {
    const lastRoom = rooms[rooms.length - 1];
    setTile(
      Math.floor(lastRoom.x + lastRoom.w / 2),
      Math.floor(lastRoom.y + lastRoom.h / 2),
      TILE_STAIRS,
    );
  }

  // Place enemies in other rooms
  let enemyIdx = 0;
  for (let r = 1; r < rooms.length - 1 && enemyIdx < MAX_ENEMIES; r++) {
    const count = Mathf.randomInt(1, 2);
    for (let e = 0; e < count && enemyIdx < MAX_ENEMIES; e++) {
      const ex = Mathf.randomInt(rooms[r].x + 1, rooms[r].x + rooms[r].w - 2);
      const ey = Mathf.randomInt(rooms[r].y + 1, rooms[r].y + rooms[r].h - 2);
      if (enemyIdx >= enemies.length) {
        enemies.push({ position: new Vector2D(ex, ey), hp: 5 + floor * 2, maxHp: 5 + floor * 2, attack: 2 + floor, active: true, name: "Goblin" });
      } else {
        enemies[enemyIdx].position.x = ex;
        enemies[enemyIdx].position.y = ey;
        enemies[enemyIdx].hp = 5 + floor * 2;
        enemies[enemyIdx].maxHp = 5 + floor * 2;
        enemies[enemyIdx].attack = 2 + floor;
        enemies[enemyIdx].active = true;
        enemies[enemyIdx].name = floor >= 3 ? "Orc" : "Goblin";
      }
      enemyIdx++;
    }
  }
}

function computeVisibility(): void {
  for (let i = 0; i < MAP_WIDTH * MAP_HEIGHT; i++) {
    visible[i] = false;
  }

  // Simple raycasting FOV
  const steps = 360;
  for (let a = 0; a < steps; a++) {
    const angle = (a / steps) * Math.PI * 2;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    let rx = player.position.x + 0.5;
    let ry = player.position.y + 0.5;
    for (let d = 0; d < FOV_RADIUS; d++) {
      const tx = Math.floor(rx);
      const ty = Math.floor(ry);
      if (tx < 0 || tx >= MAP_WIDTH || ty < 0 || ty >= MAP_HEIGHT) break;
      const idx = ty * MAP_WIDTH + tx;
      visible[idx] = true;
      explored[idx] = true;
      if (map[idx] === TILE_WALL) break;
      rx = rx + dx;
      ry = ry + dy;
    }
  }
}

function enemyAt(x: number, y: number): number {
  for (let i = 0; i < enemies.length; i++) {
    if (enemies[i].active && enemies[i].position.x === x && enemies[i].position.y === y) return i;
  }
  return -1;
}

function tryMove(direction: Vector2D): void {
  const destination = player.position.add(direction);
  const nx = destination.x;
  const ny = destination.y;

  if (tileAt(nx, ny) === TILE_WALL) return;

  const ei = enemyAt(nx, ny);
  if (ei >= 0) {
    // Attack enemy
    const dmg = Mathf.randomInt(player.attack - 1, player.attack + 1);
    enemies[ei].hp = enemies[ei].hp - dmg;
    if (enemies[ei].hp <= 0) {
      enemies[ei].active = false;
      showMessage("Defeated " + enemies[ei].name + "!");
    } else {
      showMessage("Hit " + enemies[ei].name + " for " + dmg.toString() + " damage");
    }
  } else {
    player.position = destination;
  }

  // Check stairs
  if (tileAt(player.position.x, player.position.y) === TILE_STAIRS) {
    floor = floor + 1;
    generateDungeon();
    showMessage("Descended to floor " + floor.toString());
    computeVisibility();
    return;
  }

  // Enemy turns
  for (let i = 0; i < enemies.length; i++) {
    if (!enemies[i].active) continue;
    const edx = player.position.x - enemies[i].position.x;
    const edy = player.position.y - enemies[i].position.y;
    const dist = Math.abs(edx) + Math.abs(edy);

    if (dist <= 1) {
      // Attack player
      const dmg = Mathf.randomInt(enemies[i].attack - 1, enemies[i].attack + 1);
      player.hp = player.hp - dmg;
      showMessage(enemies[i].name + " hits you for " + dmg.toString() + "!");
    } else if (dist <= FOV_RADIUS && isVisible(enemies[i].position.x, enemies[i].position.y)) {
      // Move toward player
      let mx = 0;
      let my = 0;
      if (Math.abs(edx) > Math.abs(edy)) {
        mx = edx > 0 ? 1 : -1;
      } else {
        my = edy > 0 ? 1 : -1;
      }
      const movement = new Vector2D(mx, my);
      const enemyDestination = enemies[i].position.add(movement);
      const enx = enemyDestination.x;
      const eny = enemyDestination.y;
      if (tileAt(enx, eny) !== TILE_WALL && enemyAt(enx, eny) < 0 &&
          !(enx === player.position.x && eny === player.position.y)) {
        enemies[i].position = enemyDestination;
      }
    }
  }

  turnCount = turnCount + 1;
  computeVisibility();
}

function getTileColor(tile: number, vis: boolean, exp: boolean): Color {
  if (!vis && !exp) return { r: 0, g: 0, b: 0, a: 255 };
  const dim = vis ? 1.0 : 0.35;
  if (tile === TILE_WALL) return { r: Math.floor(80 * dim), g: Math.floor(80 * dim), b: Math.floor(100 * dim), a: 255 };
  if (tile === TILE_STAIRS) return { r: Math.floor(255 * dim), g: Math.floor(200 * dim), b: Math.floor(50 * dim), a: 255 };
  return { r: Math.floor(40 * dim), g: Math.floor(40 * dim), b: Math.floor(50 * dim), a: 255 };
}

class DungeonCrawlGame extends Game {
  protected override loop(dt: number): void {
    if (player.hp > 0) {
      // Turn-based input
      if (this.input.isKeyPressed(Key.UP) || this.input.isKeyPressed(Key.W)) tryMove(new Vector2D(0, -1));
      if (this.input.isKeyPressed(Key.DOWN) || this.input.isKeyPressed(Key.S)) tryMove(new Vector2D(0, 1));
      if (this.input.isKeyPressed(Key.LEFT) || this.input.isKeyPressed(Key.A)) tryMove(new Vector2D(-1, 0));
      if (this.input.isKeyPressed(Key.RIGHT) || this.input.isKeyPressed(Key.D)) tryMove(new Vector2D(1, 0));
      // Wait
      if (this.input.isKeyPressed(Key.PERIOD)) tryMove(Vector2D.zero());
    } else {
      if (this.input.isKeyPressed(Key.ENTER)) {
        player.hp = player.maxHp;
        floor = 1;
        turnCount = 0;
        generateDungeon();
        computeVisibility();
        showMessage("You rise again...");
      }
    }

    // Camera zoom
    if (this.input.isKeyDown(Key.EQUAL)) camera.zoom = Mathf.clamp(camera.zoom + dt, 0.5, 3.0);
    if (this.input.isKeyDown(Key.MINUS)) camera.zoom = Mathf.clamp(camera.zoom - dt, 0.5, 3.0);

    // Smooth camera follow
    const targetCamera = new Vector2D(
      player.position.x * TILE_SIZE + TILE_SIZE / 2,
      player.position.y * TILE_SIZE + TILE_SIZE / 2,
    );
    camera.target = Vector2D.lerpUnclamped(camera.target, targetCamera, 8 * dt);

    // Message timer
    if (messageTimer > 0) messageTimer = messageTimer - dt;

    // Drawing
  }

  protected override render(): void {
    this.renderer.clear({ r: 10, g: 10, b: 15, a: 255 });

    this.renderer.begin2D(camera);

    // Draw tiles
    const viewTiles = Math.ceil(SCREEN_WIDTH / TILE_SIZE / camera.zoom) + 2;
    const camTileX = Math.floor(camera.target.x / TILE_SIZE);
    const camTileY = Math.floor(camera.target.y / TILE_SIZE);
    for (let dy = -viewTiles; dy <= viewTiles; dy++) {
      for (let dx = -viewTiles; dx <= viewTiles; dx++) {
        const tx = camTileX + dx;
        const ty = camTileY + dy;
        if (tx < 0 || tx >= MAP_WIDTH || ty < 0 || ty >= MAP_HEIGHT) continue;
        const tile = map[ty * MAP_WIDTH + tx];
        const vis = isVisible(tx, ty);
        const exp = isExplored(tx, ty);
        if (!vis && !exp) continue;
        const color = getTileColor(tile, vis, exp);
        this.renderer.drawRectangle({ x: tx * TILE_SIZE, y: ty * TILE_SIZE, width: TILE_SIZE, height: TILE_SIZE }, color);
      }
    }

    // Draw enemies
    for (let i = 0; i < enemies.length; i++) {
      if (!enemies[i].active) continue;
      if (!isVisible(enemies[i].position.x, enemies[i].position.y)) continue;
      this.renderer.drawRectangle({ x: enemies[i].position.x * TILE_SIZE + 4, y: enemies[i].position.y * TILE_SIZE + 4, width: TILE_SIZE - 8, height: TILE_SIZE - 8 }, { r: 200, g: 50, b: 50, a: 255 });
      // HP bar
      const hpRatio = enemies[i].hp / enemies[i].maxHp;
      this.renderer.drawRectangle({ x: enemies[i].position.x * TILE_SIZE, y: enemies[i].position.y * TILE_SIZE - 4, width: Math.floor(TILE_SIZE * hpRatio), height: 3 }, Colors.RED);
    }

    // Draw player
    this.renderer.drawRectangle({ x: player.position.x * TILE_SIZE + 2, y: player.position.y * TILE_SIZE + 2, width: TILE_SIZE - 4, height: TILE_SIZE - 4 }, { r: 50, g: 150, b: 255, a: 255 });

    this.renderer.end2D();

    // HUD
    this.renderer.drawRectangle({ x: 0, y: 0, width: SCREEN_WIDTH, height: 35 }, { r: 0, g: 0, b: 0, a: 180 });
    this.renderer.drawText("HP: " + player.hp.toString() + "/" + player.maxHp.toString(), new Vector2D(10, 8), 20, player.hp > player.maxHp / 3 ? Colors.GREEN : Colors.RED);
    this.renderer.drawText("Floor: " + floor.toString(), new Vector2D(200, 8), 20, Colors.WHITE);
    this.renderer.drawText("Turns: " + turnCount.toString(), new Vector2D(350, 8), 20, Colors.LIGHTGRAY);

    // Message log
    if (messageTimer > 0) {
      const alpha = Math.floor(Mathf.clamp(messageTimer * 255, 0, 255));
      this.renderer.drawText(message, new Vector2D(10, SCREEN_HEIGHT - 30), 18, { r: 255, g: 255, b: 200, a: alpha });
    }

    // Death screen
    if (player.hp <= 0) {
      this.renderer.drawRectangle({ x: 0, y: SCREEN_HEIGHT / 2 - 50, width: SCREEN_WIDTH, height: 100 }, { r: 0, g: 0, b: 0, a: 200 });
      const deathMsg = "You have perished on floor " + floor.toString();
      this.renderer.drawText(deathMsg, new Vector2D(SCREEN_WIDTH / 2 - this.renderer.measureText(deathMsg, 24) / 2, SCREEN_HEIGHT / 2 - 20), 24, Colors.RED);
      const restartMsg = "Press ENTER to try again";
      this.renderer.drawText(restartMsg, new Vector2D(SCREEN_WIDTH / 2 - this.renderer.measureText(restartMsg, 18) / 2, SCREEN_HEIGHT / 2 + 15), 18, Colors.LIGHTGRAY);
    }

  }
}

const game = new DungeonCrawlGame({ window: { width: SCREEN_WIDTH, height: SCREEN_HEIGHT, title: "Dungeon Crawl" }, targetFps: 60 });

// Initialize arrays
for (let i = 0; i < MAP_WIDTH * MAP_HEIGHT; i++) {
  map.push(TILE_WALL);
  visible.push(false);
  explored.push(false);
}

generateDungeon();
computeVisibility();

const camera: Camera2D = {
  offset: new Vector2D(SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2),
  target: new Vector2D(player.position.x * TILE_SIZE + TILE_SIZE / 2, player.position.y * TILE_SIZE + TILE_SIZE / 2),
  rotation: 0,
  zoom: 1.0,
};

// Main game loop
game.run();
