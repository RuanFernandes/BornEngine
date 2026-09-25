import { Transform } from '../../src/game/transform';

function expect(value: boolean, label: string): void {
  if (!value) {
    console.error('FAIL: ' + label);
    process.exit(1);
  }
}

function expectClose(actual: number, expected: number, label: string): void {
  expect(Math.abs(actual - expected) < 0.00001, label);
}

const inputPosition = { x: 2, y: 3, z: 4 };
const transform = new Transform({ position: inputPosition });
inputPosition.x = 90;

expect(transform.position.x === 2, 'constructor copies local position');
expect(transform.rotation.w === 1, 'rotation defaults to identity');
expect(transform.scale.y === 1, 'scale defaults to one');
expect(transform.localMatrix[12] === 2, 'local matrix stores translation');
expect(transform.localMatrix[13] === 3, 'local matrix stores y translation');
expect(transform.localMatrix[14] === 4, 'local matrix stores z translation');

const matrixCopy = transform.localMatrix;
matrixCopy[12] = 99;
expect(transform.localMatrix[12] === 2, 'matrix getter returns a copy');

const positionCopy = transform.worldPosition;
positionCopy.x = 99;
expect(transform.worldPosition.x === 2, 'world position getter returns a copy');

const rotationCopy = transform.worldRotation;
rotationCopy.w = 0;
expect(transform.worldRotation.w === 1, 'world rotation getter returns a copy');

const scaleCopy = transform.worldScale;
scaleCopy.x = 99;
expect(transform.worldScale.x === 1, 'world scale getter returns a copy');

transform.position.x = 5;
expect(transform.localMatrix[12] === 5, 'local matrix reflects mutable local position');

transform.scale = { x: 2, y: 3, z: 4 };
const scaledMatrix = transform.localMatrix;
expect(scaledMatrix[0] === 2, 'local matrix applies non-uniform x scale');
expect(scaledMatrix[5] === 3, 'local matrix applies non-uniform y scale');
expect(scaledMatrix[10] === 4, 'local matrix applies non-uniform z scale');

transform.rotation = {
  x: 0,
  y: 0,
  z: Math.sin(Math.PI / 4),
  w: Math.cos(Math.PI / 4),
};
const rotatedMatrix = transform.localMatrix;
expectClose(rotatedMatrix[0], 0, 'local matrix rotates x axis');
expectClose(rotatedMatrix[1], 2, 'rotation is composed before x scale');
expectClose(rotatedMatrix[4], -3, 'rotation is composed before y scale');
expectClose(rotatedMatrix[5], 0, 'local matrix rotates y axis');

const defaultTransform = new Transform();
expect(defaultTransform.position.x === 0, 'position defaults to zero');
expect(defaultTransform.rotation.x === 0 && defaultTransform.rotation.w === 1,
  'default quaternion is identity');
expect(defaultTransform.scale.x === 1 && defaultTransform.scale.z === 1,
  'default scale is one');

expect(defaultTransform.setWorldPosition({ x: 7, y: 8, z: 9 }),
  'root world position can be set');
expect(defaultTransform.position.x === 7 && defaultTransform.position.y === 8,
  'root world position updates local position');
expect(defaultTransform.setWorldRotation({ x: 0, y: 0, z: 0, w: 1 }),
  'root world rotation can be set');
