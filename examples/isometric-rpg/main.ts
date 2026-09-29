import { Colors, Game, Key, Mathf, Vector2D } from '@bornengine/engine';
import type { Camera2D, Color } from '@bornengine/engine';

// Constants
const SCREEN_WIDTH = 960;
const SCREEN_HEIGHT = 640;
const TILE_W = 64;
const TILE_H = 32;
const MAP_W = 20;
const MAP_H = 20;
const MAX_NPCS = 8;
const MAX_ITEMS = 20;

// Tile types
const T_GRASS = 0;
const T_PATH = 1;
const T_WATER = 2;
const T_WALL = 3;
const T_FLOOR = 4;

// Item types
const ITEM_POTION = 0;
const ITEM_SWORD = 1;
const ITEM_SHIELD = 2;
const ITEM_KEY = 3;
const ITEM_COIN = 4;

interface Entity {
  mapPosition: Vector2D;
  screenPosition: Vector2D;
  name: string;
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  friendly: boolean;
  dialogue: string[];
  dialogueIndex: number;
}

interface Item {
  type: number;
  mapPosition: Vector2D;
  active: boolean;
  name: string;
}

// Isometric conversion
function isoToScreen(mapPosition: Vector2D): Vector2D {
  return new Vector2D(
    (mapPosition.x - mapPosition.y) * (TILE_W / 2),
    (mapPosition.x + mapPosition.y) * (TILE_H / 2),
  );
}

function screenToIso(screenPosition: Vector2D): Vector2D {
  return new Vector2D(
    Math.floor((screenPosition.x / (TILE_W / 2) + screenPosition.y / (TILE_H / 2)) / 2),
    Math.floor((screenPosition.y / (TILE_H / 2) - screenPosition.x / (TILE_W / 2)) / 2),
  );
}

// Game state
const map: number[] = [];
for (let i = 0; i < MAP_W * MAP_H; i++) map.push(T_GRASS);

const player: Entity = {
  mapPosition: new Vector2D(5, 5), screenPosition: Vector2D.zero(),
  name: "Hero", hp: 30, maxHp: 30, attack: 8, defense: 3,
  friendly: true, dialogue: [], dialogueIndex: 0,
};

const npcs: Entity[] = [];
const items: Item[] = [];
const inventory: number[] = []; // item types collected
let gold = 0;
let exp = 0;
let level = 1;

// Dialogue state
let showDialogue = false;
let dialogueNpc = -1;
let dialogueText = "";

// Message log
let message = "";
let messageTimer = 0;

function showMsg(msg: string): void {
  message = msg;
  messageTimer = 3;
}

function tileAt(x: number, y: number): number {
  if (x < 0 || x >= MAP_W || y < 0 || y >= MAP_H) return T_WATER;
  return map[y * MAP_W + x];
}

function setTile(x: number, y: number, t: number): void {
  if (x >= 0 && x < MAP_W && y >= 0 && y < MAP_H) {
    map[y * MAP_W + x] = t;
  }
}

function isWalkable(x: number, y: number): boolean {
  const t = tileAt(x, y);
  return t !== T_WATER && t !== T_WALL;
}

function tileColor(t: number): Color {
  if (t === T_GRASS) return { r: 80, g: 160, b: 60, a: 255 };
  if (t === T_PATH) return { r: 180, g: 160, b: 120, a: 255 };
  if (t === T_WATER) return { r: 40, g: 90, b: 200, a: 255 };
  if (t === T_WALL) return { r: 100, g: 90, b: 80, a: 255 };
  if (t === T_FLOOR) return { r: 150, g: 130, b: 100, a: 255 };
  return { r: 100, g: 100, b: 100, a: 255 };
}

function itemColor(t: number): Color {
  if (t === ITEM_POTION) return { r: 255, g: 50, b: 50, a: 255 };
  if (t === ITEM_SWORD) return { r: 200, g: 200, b: 220, a: 255 };
  if (t === ITEM_SHIELD) return { r: 100, g: 100, b: 200, a: 255 };
  if (t === ITEM_KEY) return { r: 255, g: 220, b: 50, a: 255 };
  if (t === ITEM_COIN) return { r: 255, g: 200, b: 0, a: 255 };
  return Colors.WHITE;
}

function itemName(t: number): string {
  if (t === ITEM_POTION) return "Potion";
  if (t === ITEM_SWORD) return "Sword";
  if (t === ITEM_SHIELD) return "Shield";
  if (t === ITEM_KEY) return "Key";
  if (t === ITEM_COIN) return "Gold";
  return "???";
}

// Generate the world
function generateWorld(): void {
  // Grass everywhere
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      setTile(x, y, T_GRASS);
    }
  }

  // Paths
  for (let x = 3; x < MAP_W - 3; x++) { setTile(x, 10, T_PATH); }
  for (let y = 3; y < MAP_H - 3; y++) { setTile(10, y, T_PATH); }

  // Water pond
  for (let y = 14; y < 18; y++) {
    for (let x = 14; x < 18; x++) {
      setTile(x, y, T_WATER);
    }
  }

  // Building (walls + floor)
  for (let x = 2; x < 7; x++) {
    setTile(x, 2, T_WALL);
    setTile(x, 6, T_WALL);
  }
  for (let y = 2; y < 7; y++) {
    setTile(2, y, T_WALL);
    setTile(6, y, T_WALL);
  }
  for (let y = 3; y < 6; y++) {
    for (let x = 3; x < 6; x++) {
      setTile(x, y, T_FLOOR);
    }
  }
  setTile(4, 6, T_FLOOR); // Door

  // NPCs
  npcs.push({
    mapPosition: new Vector2D(4, 4), screenPosition: Vector2D.zero(),
    name: "Elder", hp: 20, maxHp: 20, attack: 0, defense: 0,
    friendly: true,
    dialogue: [
      "Welcome, traveler! Our village is under threat.",
      "Goblins have been raiding from the east.",
      "If you defeat them, we'll reward you handsomely!",
    ],
    dialogueIndex: 0,
  });
  npcs.push({
    mapPosition: new Vector2D(12, 8), screenPosition: Vector2D.zero(),
    name: "Merchant", hp: 15, maxHp: 15, attack: 0, defense: 0,
    friendly: true,
    dialogue: ["I sell potions and shields!", "Come back when you have gold."],
    dialogueIndex: 0,
  });
  npcs.push({
    mapPosition: new Vector2D(16, 5), screenPosition: Vector2D.zero(),
    name: "Goblin", hp: 12, maxHp: 12, attack: 5, defense: 1,
    friendly: false, dialogue: ["Grrrr!"], dialogueIndex: 0,
  });
  npcs.push({
    mapPosition: new Vector2D(18, 7), screenPosition: Vector2D.zero(),
    name: "Goblin", hp: 12, maxHp: 12, attack: 5, defense: 1,
    friendly: false, dialogue: ["Grrrr!"], dialogueIndex: 0,
  });
  npcs.push({
    mapPosition: new Vector2D(17, 3), screenPosition: Vector2D.zero(),
    name: "Goblin Chief", hp: 25, maxHp: 25, attack: 8, defense: 3,
    friendly: false, dialogue: ["You dare challenge me?!"], dialogueIndex: 0,
  });

  // Items scattered around
  items.push({ type: ITEM_POTION, mapPosition: new Vector2D(8, 12), active: true, name: "Potion" });
  items.push({ type: ITEM_COIN, mapPosition: new Vector2D(6, 9), active: true, name: "Gold" });
  items.push({ type: ITEM_COIN, mapPosition: new Vector2D(15, 11), active: true, name: "Gold" });
  items.push({ type: ITEM_SWORD, mapPosition: new Vector2D(4, 3), active: true, name: "Iron Sword" });
  items.push({ type: ITEM_SHIELD, mapPosition: new Vector2D(12, 15), active: true, name: "Shield" });
  items.push({ type: ITEM_KEY, mapPosition: new Vector2D(18, 3), active: true, name: "Dungeon Key" });
}

function npcAt(position: Vector2D): number {
  for (let i = 0; i < npcs.length; i++) {
    if (npcs[i].hp > 0 && npcs[i].mapPosition.x === position.x && npcs[i].mapPosition.y === position.y) return i;
  }
  return -1;
}

function tryMovePlayer(direction: Vector2D): void {
  const destination = player.mapPosition.add(direction);
  const nx = destination.x;
  const ny = destination.y;

  if (!isWalkable(nx, ny)) return;

  // Check for NPC
  const ni = npcAt(destination);
  if (ni >= 0) {
    if (npcs[ni].friendly) {
      // Talk
      dialogueNpc = ni;
      dialogueText = npcs[ni].dialogue[npcs[ni].dialogueIndex];
      showDialogue = true;
    } else {
      // Combat
      const dmg = Math.max(1, player.attack - npcs[ni].defense + Mathf.randomInt(-2, 2));
      npcs[ni].hp = npcs[ni].hp - dmg;
      showMsg("Hit " + npcs[ni].name + " for " + dmg.toString() + "!");
      if (npcs[ni].hp <= 0) {
        showMsg("Defeated " + npcs[ni].name + "!");
        exp = exp + 10;
        if (exp >= level * 20) {
          level = level + 1;
          player.maxHp = player.maxHp + 5;
          player.hp = player.maxHp;
          player.attack = player.attack + 2;
          showMsg("Level up! You are now level " + level.toString());
        }
      } else {
        // Enemy counterattack
        const eDmg = Math.max(1, npcs[ni].attack - player.defense + Mathf.randomInt(-1, 1));
        player.hp = player.hp - eDmg;
        showMsg(npcs[ni].name + " hits back for " + eDmg.toString() + "!");
      }
    }
    return;
  }

  player.mapPosition = destination;

  // Check items
  for (let i = 0; i < items.length; i++) {
    if (items[i].active && items[i].mapPosition.x === nx && items[i].mapPosition.y === ny) {
      items[i].active = false;
      if (items[i].type === ITEM_COIN) {
        gold = gold + 10;
        showMsg("Found 10 gold!");
      } else if (items[i].type === ITEM_POTION) {
        player.hp = Math.min(player.hp + 10, player.maxHp);
        showMsg("Used potion! +10 HP");
      } else {
        inventory.push(items[i].type);
        showMsg("Found " + items[i].name + "!");
        if (items[i].type === ITEM_SWORD) player.attack = player.attack + 3;
        if (items[i].type === ITEM_SHIELD) player.defense = player.defense + 2;
      }
    }
  }
}

class IsometricRpgGame extends Game {
  protected override loop(dt: number): void {
    if (showDialogue) {
      if (this.input.isKeyPressed(Key.SPACE) || this.input.isKeyPressed(Key.ENTER)) {
        const npc = npcs[dialogueNpc];
        npc.dialogueIndex = (npc.dialogueIndex + 1) % npc.dialogue.length;
        if (npc.dialogueIndex === 0) {
          showDialogue = false;
        } else {
          dialogueText = npc.dialogue[npc.dialogueIndex];
        }
      }
    } else if (player.hp > 0) {
      // Movement (turn-based)
      if (this.input.isKeyPressed(Key.UP) || this.input.isKeyPressed(Key.W)) tryMovePlayer(new Vector2D(0, -1));
      if (this.input.isKeyPressed(Key.DOWN) || this.input.isKeyPressed(Key.S)) tryMovePlayer(new Vector2D(0, 1));
      if (this.input.isKeyPressed(Key.LEFT) || this.input.isKeyPressed(Key.A)) tryMovePlayer(new Vector2D(-1, 0));
      if (this.input.isKeyPressed(Key.RIGHT) || this.input.isKeyPressed(Key.D)) tryMovePlayer(new Vector2D(1, 0));

      // Zoom
      if (this.input.isKeyDown(Key.EQUAL)) camera.zoom = Mathf.clamp(camera.zoom + dt, 0.5, 2.0);
      if (this.input.isKeyDown(Key.MINUS)) camera.zoom = Mathf.clamp(camera.zoom - dt, 0.5, 2.0);
    } else {
      if (this.input.isKeyPressed(Key.ENTER)) {
        // Respawn
        player.hp = player.maxHp;
        player.mapPosition = new Vector2D(5, 5);
        showMsg("You wake up at the village...");
      }
    }

    // Smooth camera
    const playerScreen = isoToScreen(player.mapPosition);
    camera.target = Vector2D.lerpUnclamped(camera.target, playerScreen, 6 * dt);

    if (messageTimer > 0) messageTimer = messageTimer - dt;

    // Update NPC screen positions
    for (let i = 0; i < npcs.length; i++) {
      npcs[i].screenPosition = isoToScreen(npcs[i].mapPosition);
    }
    player.screenPosition = isoToScreen(player.mapPosition);

    // Drawing
  }

  protected override render(): void {
    this.renderer.clear({ r: 20, g: 25, b: 30, a: 255 });

    // Use camera for world rendering
    // We'll manually offset since beginMode2D uses camera transform
    const ox = SCREEN_WIDTH / 2 - camera.target.x * camera.zoom;
    const oy = SCREEN_HEIGHT / 3 - camera.target.y * camera.zoom;

    // Draw tiles (isometric diamond)
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        const tile = tileAt(x, y);
        const s = isoToScreen(new Vector2D(x, y));
        const sx = s.x * camera.zoom + ox;
        const sy = s.y * camera.zoom + oy;
        const tw = TILE_W * camera.zoom;
        const th = TILE_H * camera.zoom;
        const color = tileColor(tile);

        // Diamond shape using a filled rect (simplified isometric)
        this.renderer.drawRectangle({ x: sx - tw / 2, y: sy, width: tw, height: th }, color);
        // Outline
        this.renderer.drawRectangleOutline({ x: sx - tw / 2, y: sy, width: tw, height: th }, { r: 0, g: 0, b: 0, a: 40 }, 1);
      }
    }

    // Draw items
    for (let i = 0; i < items.length; i++) {
      if (!items[i].active) continue;
      const s = isoToScreen(items[i].mapPosition);
      const sx = s.x * camera.zoom + ox;
      const sy = s.y * camera.zoom + oy;
      const size = 8 * camera.zoom;
      this.renderer.drawCircle(new Vector2D(sx, sy + TILE_H * camera.zoom * 0.5), size, itemColor(items[i].type));
    }

    // Draw NPCs
    for (let i = 0; i < npcs.length; i++) {
      if (npcs[i].hp <= 0) continue;
      const screenPosition = npcs[i].screenPosition.scale(camera.zoom).add(new Vector2D(ox, oy));
      const sx = screenPosition.x;
      const sy = screenPosition.y;
      const size = 12 * camera.zoom;
      const bodyColor = npcs[i].friendly ? { r: 50, g: 150, b: 50, a: 255 } : { r: 200, g: 50, b: 50, a: 255 };
      this.renderer.drawRectangle({ x: sx - size / 2, y: sy - size + TILE_H * camera.zoom * 0.3, width: size, height: size * 1.5 }, bodyColor);
      // HP bar
      const barW = TILE_W * camera.zoom * 0.6;
      const hpRatio = npcs[i].hp / npcs[i].maxHp;
      this.renderer.drawRectangle({ x: sx - barW / 2, y: sy - size - 4 + TILE_H * camera.zoom * 0.3, width: barW * hpRatio, height: 3 }, Colors.RED);
    }

    // Draw player
    {
      const screenPosition = player.screenPosition.scale(camera.zoom).add(new Vector2D(ox, oy));
      const sx = screenPosition.x;
      const sy = screenPosition.y;
      const size = 14 * camera.zoom;
      this.renderer.drawRectangle({ x: sx - size / 2, y: sy - size + TILE_H * camera.zoom * 0.3, width: size, height: size * 1.5 }, { r: 50, g: 100, b: 255, a: 255 });
      // Head
      this.renderer.drawCircle(new Vector2D(sx, sy - size + TILE_H * camera.zoom * 0.3 - 4 * camera.zoom), 5 * camera.zoom, { r: 230, g: 200, b: 170, a: 255 });
    }

    // HUD panel
    this.renderer.drawRectangle({ x: 0, y: 0, width: SCREEN_WIDTH, height: 45 }, { r: 20, g: 20, b: 30, a: 220 });
    this.renderer.drawText(player.name + "  Lv." + level.toString(), new Vector2D(10, 5), 18, Colors.WHITE);
    // HP bar
    this.renderer.drawRectangle({ x: 10, y: 28, width: 120, height: 10 }, { r: 60, g: 0, b: 0, a: 255 });
    this.renderer.drawRectangle({ x: 10, y: 28, width: Math.floor(120 * player.hp / player.maxHp), height: 10 }, Colors.RED);
    this.renderer.drawText(player.hp.toString() + "/" + player.maxHp.toString(), new Vector2D(15, 27), 10, Colors.WHITE);

    this.renderer.drawText("ATK: " + player.attack.toString(), new Vector2D(150, 8), 16, { r: 255, g: 150, b: 50, a: 255 });
    this.renderer.drawText("DEF: " + player.defense.toString(), new Vector2D(240, 8), 16, { r: 50, g: 150, b: 255, a: 255 });
    this.renderer.drawText("Gold: " + gold.toString(), new Vector2D(330, 8), 16, Colors.YELLOW);
    this.renderer.drawText("EXP: " + exp.toString() + "/" + (level * 20).toString(), new Vector2D(430, 8), 16, { r: 150, g: 255, b: 150, a: 255 });

    // Inventory
    if (inventory.length > 0) {
      let invStr = "Items: ";
      for (let i = 0; i < inventory.length; i++) {
        if (i > 0) invStr = invStr + ", ";
        invStr = invStr + itemName(inventory[i]);
      }
      this.renderer.drawText(invStr, new Vector2D(550, 8), 14, Colors.LIGHTGRAY);
    }

    // Dialogue box
    if (showDialogue) {
      this.renderer.drawRectangle({ x: 50, y: SCREEN_HEIGHT - 120, width: SCREEN_WIDTH - 100, height: 100 }, { r: 10, g: 10, b: 30, a: 230 });
      this.renderer.drawRectangleOutline({ x: 50, y: SCREEN_HEIGHT - 120, width: SCREEN_WIDTH - 100, height: 100 }, Colors.WHITE, 2);
      const npcName = npcs[dialogueNpc].name;
      this.renderer.drawText(npcName, new Vector2D(70, SCREEN_HEIGHT - 110), 20, Colors.YELLOW);
      this.renderer.drawText(dialogueText, new Vector2D(70, SCREEN_HEIGHT - 80), 18, Colors.WHITE);
      this.renderer.drawText("[SPACE] to continue", new Vector2D(70, SCREEN_HEIGHT - 35), 14, Colors.LIGHTGRAY);
    }

    // Message log
    if (messageTimer > 0) {
      const alpha = Math.floor(Mathf.clamp(messageTimer * 255, 0, 255));
      this.renderer.drawText(message, new Vector2D(10, SCREEN_HEIGHT - 30), 16, { r: 255, g: 255, b: 200, a: alpha });
    }

    // Death
    if (player.hp <= 0) {
      this.renderer.drawRectangle({ x: 0, y: SCREEN_HEIGHT / 2 - 40, width: SCREEN_WIDTH, height: 80 }, { r: 0, g: 0, b: 0, a: 200 });
      this.renderer.drawText("YOU DIED", new Vector2D(SCREEN_WIDTH / 2 - this.renderer.measureText("YOU DIED", 50) / 2, SCREEN_HEIGHT / 2 - 30), 50, Colors.RED);
      this.renderer.drawText("Press ENTER to respawn", new Vector2D(SCREEN_WIDTH / 2 - this.renderer.measureText("Press ENTER to respawn", 18) / 2, SCREEN_HEIGHT / 2 + 25), 18, Colors.LIGHTGRAY);
    }

    // Controls hint
    this.renderer.drawText("WASD/Arrows: Move | +/-: Zoom", new Vector2D(SCREEN_WIDTH - 310, SCREEN_HEIGHT - 20), 12, { r: 150, g: 150, b: 150, a: 150 });

  }
}

const game = new IsometricRpgGame({ window: { width: SCREEN_WIDTH, height: SCREEN_HEIGHT, title: "Isometric RPG" }, targetFps: 60 });
generateWorld();

const camera: Camera2D = {
  offset: new Vector2D(SCREEN_WIDTH / 2, SCREEN_HEIGHT / 3),
  target: Vector2D.zero(),
  rotation: 0,
  zoom: 1.0,
};

game.run();
