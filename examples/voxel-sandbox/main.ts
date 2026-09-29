import { Colors, Game, Key, Mathf, MouseButton, Vector2D } from '@bornengine/engine';
import type { Camera3D, Color } from '@bornengine/engine';

// Constants
const SCREEN_WIDTH = 960;
const SCREEN_HEIGHT = 540;
const CHUNK_SIZE = 16;
const WORLD_CHUNKS_X = 4;
const WORLD_CHUNKS_Z = 4;
const WORLD_HEIGHT = 32;
const BLOCK_AIR = 0;
const BLOCK_GRASS = 1;
const BLOCK_DIRT = 2;
const BLOCK_STONE = 3;
const BLOCK_WOOD = 4;
const BLOCK_LEAVES = 5;
const BLOCK_SAND = 6;
const BLOCK_WATER = 7;

// Pre-allocated block color table (avoid allocations in hot render loop)
const BLOCK_COLORS: Color[] = [
  { r: 255, g: 0, b: 255, a: 255 },   // 0: AIR (unused)
  { r: 60, g: 170, b: 60, a: 255 },    // 1: GRASS
  { r: 130, g: 90, b: 50, a: 255 },    // 2: DIRT
  { r: 128, g: 128, b: 128, a: 255 },  // 3: STONE
  { r: 120, g: 80, b: 40, a: 255 },    // 4: WOOD
  { r: 30, g: 130, b: 30, a: 200 },    // 5: LEAVES
  { r: 220, g: 200, b: 120, a: 255 },  // 6: SAND
  { r: 40, g: 80, b: 200, a: 150 },    // 7: WATER
];

const worldSizeX = WORLD_CHUNKS_X * CHUNK_SIZE;
const worldSizeZ = WORLD_CHUNKS_Z * CHUNK_SIZE;
const MOVE_SPEED = 12;
const MOUSE_SENS = 0.003;

class VoxelSandboxGame extends Game {
  private readonly blocks: number[] = [];
  private camYaw = 0;
  private camPitch = 0;
  private camX = worldSizeX / 2;
  private camY = 20;
  private camZ = worldSizeZ / 2;
  private selectedBlock = BLOCK_STONE;
  private highlightX = -1;
  private highlightY = -1;
  private highlightZ = -1;
  private readonly camera: Camera3D = {
    position: { x: worldSizeX / 2, y: 20, z: worldSizeZ / 2 },
    target: { x: 0, y: 0, z: 0 },
    up: { x: 0, y: 1, z: 0 },
    fovy: 70,
    projection: 'perspective',
  };
  private readonly renderPosition = { x: 0, y: 0, z: 0 };

  protected override onStart(): void {
    this.input.disableCursor();
    this.generateTerrain();
  }

  protected override loop(deltaTime: number): void {
    this.handleInput(deltaTime);
  }

  protected override render(): void {
    this.renderer.clear({ r: 130, g: 200, b: 255, a: 255 });

    this.renderer.begin3D(this.camera);
    this.renderBlocks();

    if (this.highlightX >= 0) {
      this.renderer.drawCubeOutline(
        { x: this.highlightX + 0.5, y: this.highlightY + 0.5, z: this.highlightZ + 0.5 },
        { x: 1.02, y: 1.02, z: 1.02 },
        Colors.WHITE,
      );
    }
    this.renderer.end3D();

    this.drawHUD();
  }

  private blockIndex(x: number, y: number, z: number): number {
    return (y * worldSizeX * worldSizeZ) + (z * worldSizeX) + x;
  }

  private getBlock(x: number, y: number, z: number): number {
    if (x < 0 || x >= worldSizeX || y < 0 || y >= WORLD_HEIGHT || z < 0 || z >= worldSizeZ) return BLOCK_AIR;
    return this.blocks[this.blockIndex(x, y, z)];
  }

  private setBlock(x: number, y: number, z: number, type: number): void {
    if (x < 0 || x >= worldSizeX || y < 0 || y >= WORLD_HEIGHT || z < 0 || z >= worldSizeZ) return;
    this.blocks[this.blockIndex(x, y, z)] = type;
  }

  private generateTerrain(): void {
    for (let index = 0; index < worldSizeX * WORLD_HEIGHT * worldSizeZ; index++) {
      this.blocks.push(BLOCK_AIR);
    }

    for (let z = 0; z < worldSizeZ; z++) {
      for (let x = 0; x < worldSizeX; x++) {
        const height = Math.floor(
          8 + Math.sin(x * 0.1) * 3 + Math.cos(z * 0.12) * 3
          + Math.sin(x * 0.05 + z * 0.05) * 5
        );

        for (let y = 0; y < WORLD_HEIGHT; y++) {
          if (y === 0) {
            this.setBlock(x, y, z, BLOCK_STONE);
          } else if (y < height - 3) {
            this.setBlock(x, y, z, BLOCK_STONE);
          } else if (y < height) {
            this.setBlock(x, y, z, BLOCK_DIRT);
          } else if (y === height) {
            this.setBlock(x, y, z, height < 6 ? BLOCK_SAND : BLOCK_GRASS);
          } else if (y <= 5) {
            this.setBlock(x, y, z, BLOCK_WATER);
          }
        }
      }
    }

    for (let tree = 0; tree < 20; tree++) {
      const tx = Mathf.randomInt(3, worldSizeX - 4);
      const tz = Mathf.randomInt(3, worldSizeZ - 4);
      let surfaceY = 0;
      for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
        if (this.getBlock(tx, y, tz) === BLOCK_GRASS) { surfaceY = y; break; }
      }
      if (surfaceY < 7) continue;

      const trunkHeight = Mathf.randomInt(4, 6);
      for (let y = 1; y <= trunkHeight; y++) {
        this.setBlock(tx, surfaceY + y, tz, BLOCK_WOOD);
      }
      for (let dy = -2; dy <= 1; dy++) {
        const radius = dy < 0 ? 2 : 1;
        for (let dx = -radius; dx <= radius; dx++) {
          for (let dz = -radius; dz <= radius; dz++) {
            if (dx === 0 && dz === 0 && dy < 0) continue;
            this.setBlock(tx + dx, surfaceY + trunkHeight + dy, tz + dz, BLOCK_LEAVES);
          }
        }
      }
    }
  }

  private getCamForward(): { x: number; y: number; z: number } {
    return {
      x: Math.cos(this.camPitch) * Math.sin(this.camYaw),
      y: Math.sin(this.camPitch),
      z: Math.cos(this.camPitch) * Math.cos(this.camYaw),
    };
  }

  private getCamRight(): { x: number; y: number; z: number } {
    return { x: Math.cos(this.camYaw), y: 0, z: -Math.sin(this.camYaw) };
  }

  private raycastBlock(): void {
    const dir = this.getCamForward();
    let rx = this.camX;
    let ry = this.camY;
    let rz = this.camZ;
    this.highlightX = -1;
    this.highlightY = -1;
    this.highlightZ = -1;

    for (let step = 0; step < 60; step++) {
      const bx = Math.floor(rx);
      const by = Math.floor(ry);
      const bz = Math.floor(rz);
      if (bx < 0 || bx >= worldSizeX || by < 0 || by >= WORLD_HEIGHT || bz < 0 || bz >= worldSizeZ) break;
      const block = this.getBlock(bx, by, bz);
      if (block !== BLOCK_AIR && block !== BLOCK_WATER) {
        this.highlightX = bx;
        this.highlightY = by;
        this.highlightZ = bz;
        break;
      }
      rx += dir.x * 0.2;
      ry += dir.y * 0.2;
      rz += dir.z * 0.2;
    }
  }

  private handleInput(deltaTime: number): void {
    this.camYaw += this.input.getMouseDeltaX() * MOUSE_SENS;
    this.camPitch = Mathf.clamp(this.camPitch - this.input.getMouseDeltaY() * MOUSE_SENS, -1.4, 1.4);

    const forward = this.getCamForward();
    const right = this.getCamRight();
    let moveX = 0;
    let moveZ = 0;
    let moveY = 0;

    if (this.input.isKeyDown(Key.W)) { moveX += forward.x; moveZ += forward.z; }
    if (this.input.isKeyDown(Key.S)) { moveX -= forward.x; moveZ -= forward.z; }
    if (this.input.isKeyDown(Key.A)) { moveX -= right.x; moveZ -= right.z; }
    if (this.input.isKeyDown(Key.D)) { moveX += right.x; moveZ += right.z; }
    if (this.input.isKeyDown(Key.SPACE)) moveY = 1;
    if (this.input.isKeyDown(Key.LEFT_SHIFT)) moveY = -1;

    const length = Math.sqrt(moveX * moveX + moveZ * moveZ);
    if (length > 0) { moveX /= length; moveZ /= length; }

    this.camX += moveX * MOVE_SPEED * deltaTime;
    this.camY += moveY * MOVE_SPEED * deltaTime;
    this.camZ += moveZ * MOVE_SPEED * deltaTime;

    if (this.input.isKeyPressed(Key.ONE)) this.selectedBlock = BLOCK_GRASS;
    if (this.input.isKeyPressed(Key.TWO)) this.selectedBlock = BLOCK_DIRT;
    if (this.input.isKeyPressed(Key.THREE)) this.selectedBlock = BLOCK_STONE;
    if (this.input.isKeyPressed(Key.FOUR)) this.selectedBlock = BLOCK_WOOD;
    if (this.input.isKeyPressed(Key.FIVE)) this.selectedBlock = BLOCK_LEAVES;
    if (this.input.isKeyPressed(Key.SIX)) this.selectedBlock = BLOCK_SAND;
    if (this.input.isKeyPressed(Key.SEVEN)) this.selectedBlock = BLOCK_WATER;

    this.raycastBlock();

    if (this.input.isMouseButtonPressed(MouseButton.LEFT) && this.highlightX >= 0) {
      this.setBlock(this.highlightX, this.highlightY, this.highlightZ, BLOCK_AIR);
    }

    if (this.input.isMouseButtonPressed(MouseButton.RIGHT) && this.highlightX >= 0) {
      const dir = this.getCamForward();
      let rx = this.camX;
      let ry = this.camY;
      let rz = this.camZ;
      let prevBx = Math.floor(rx);
      let prevBy = Math.floor(ry);
      let prevBz = Math.floor(rz);
      for (let step = 0; step < 60; step++) {
        const bx = Math.floor(rx);
        const by = Math.floor(ry);
        const bz = Math.floor(rz);
        if (bx === this.highlightX && by === this.highlightY && bz === this.highlightZ) {
          if (this.getBlock(prevBx, prevBy, prevBz) === BLOCK_AIR) {
            this.setBlock(prevBx, prevBy, prevBz, this.selectedBlock);
          }
          break;
        }
        prevBx = bx;
        prevBy = by;
        prevBz = bz;
        rx += dir.x * 0.2;
        ry += dir.y * 0.2;
        rz += dir.z * 0.2;
      }
    }

    this.camera.position.x = this.camX;
    this.camera.position.y = this.camY;
    this.camera.position.z = this.camZ;
    this.camera.target.x = this.camX + forward.x;
    this.camera.target.y = this.camY + forward.y;
    this.camera.target.z = this.camZ + forward.z;
  }

  private renderBlocks(): void {
    const renderDistance = 32;
    const minX = Math.max(0, Math.floor(this.camX - renderDistance));
    const maxX = Math.min(worldSizeX - 1, Math.floor(this.camX + renderDistance));
    const minZ = Math.max(0, Math.floor(this.camZ - renderDistance));
    const maxZ = Math.min(worldSizeZ - 1, Math.floor(this.camZ + renderDistance));

    for (let y = 0; y < WORLD_HEIGHT; y++) {
      for (let z = minZ; z <= maxZ; z++) {
        for (let x = minX; x <= maxX; x++) {
          const block = this.getBlock(x, y, z);
          if (block === BLOCK_AIR) continue;
          if (
            this.getBlock(x - 1, y, z) !== BLOCK_AIR && this.getBlock(x + 1, y, z) !== BLOCK_AIR &&
            this.getBlock(x, y - 1, z) !== BLOCK_AIR && this.getBlock(x, y + 1, z) !== BLOCK_AIR &&
            this.getBlock(x, y, z - 1) !== BLOCK_AIR && this.getBlock(x, y, z + 1) !== BLOCK_AIR
          ) continue;
          this.renderPosition.x = x + 0.5;
          this.renderPosition.y = y + 0.5;
          this.renderPosition.z = z + 0.5;
          this.renderer.drawCube(this.renderPosition, { x: 1, y: 1, z: 1 }, BLOCK_COLORS[block]);
        }
      }
    }
  }

  private drawHUD(): void {
    const centerX = SCREEN_WIDTH / 2;
    const centerY = SCREEN_HEIGHT / 2;
    this.renderer.drawRectangle({ x: centerX - 10, y: centerY - 1, width: 20, height: 2 }, Colors.WHITE);
    this.renderer.drawRectangle({ x: centerX - 1, y: centerY - 10, width: 2, height: 20 }, Colors.WHITE);

    const blockNames = ['', 'Grass', 'Dirt', 'Stone', 'Wood', 'Leaves', 'Sand', 'Water'];
    this.renderer.drawRectangle({ x: 5, y: SCREEN_HEIGHT - 35, width: 200, height: 30 }, { r: 0, g: 0, b: 0, a: 150 });
    this.renderer.drawText(`Block: ${blockNames[this.selectedBlock]} [1-7]`, new Vector2D(10, SCREEN_HEIGHT - 30), 18, Colors.WHITE);
    this.renderer.drawText(
      `Pos: ${Math.floor(this.camX)}, ${Math.floor(this.camY)}, ${Math.floor(this.camZ)}`,
      new Vector2D(10, 10),
      16,
      Colors.WHITE,
    );
  }
}

new VoxelSandboxGame({
  window: { width: SCREEN_WIDTH, height: SCREEN_HEIGHT, title: 'Voxel Sandbox' },
  targetFps: 60,
}).run();
