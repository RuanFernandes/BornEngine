import { Vector2D } from '../../src/math/vector2d';

function expect(value: boolean, label: string): void {
  if (!value) throw new Error(`Vector2D: ${label}`);
}

function close(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.00001;
}

const point = new Vector2D(3, 4);
expect(point.x === 3 && point.y === 4, 'constructs from x and y');
expect(new Vector2D().equals(Vector2D.zero()), 'defaults each coordinate to zero');
const mutable = new Vector2D();
expect(mutable.set(2, 3) === mutable && mutable.copy({ x: 4, y: 5 }) === mutable && mutable.equals(new Vector2D(4, 5)), 'supports explicit in-place updates');
expect(close(point.magnitude, 5), 'exposes magnitude');
expect(close(point.sqrMagnitude, 25), 'exposes squared magnitude');
expect(point.normalized.equalsApprox(new Vector2D(0.6, 0.8)), 'normalizes without mutating');
expect(point.add(new Vector2D(1, 2)).equals(new Vector2D(4, 6)), 'adds vectors');
expect(point.scale(2).equals(new Vector2D(6, 8)), 'scales as an instance operation');
expect(Vector2D.sum(point, new Vector2D(1, 2)).equals(new Vector2D(4, 6)), 'adds as a static operation');
expect(Vector2D.difference(point, new Vector2D(1, 2)).equals(new Vector2D(2, 2)), 'subtracts as a static operation');
expect(Vector2D.componentProduct(point, new Vector2D(2, 3)).equals(new Vector2D(6, 12)), 'multiplies components');
expect(Vector2D.componentQuotient(point, new Vector2D(0, 2)).equals(new Vector2D(0, 2)), 'divides components safely');
expect(Vector2D.min(point, new Vector2D(2, 6)).equals(new Vector2D(2, 4)), 'finds component minimum');
expect(Vector2D.max(point, new Vector2D(2, 6)).equals(new Vector2D(3, 6)), 'finds component maximum');
expect(Vector2D.clamp(new Vector2D(-2, 6), new Vector2D(0, 1), new Vector2D(4, 5)).equals(new Vector2D(0, 5)), 'clamps each component');
expect(Vector2D.clamp(new Vector2D(2, 8), new Vector2D(5, 9), new Vector2D(0, 4)).equals(new Vector2D(2, 8)), 'normalizes reversed clamp bounds');
expect(Vector2D.clampMagnitude(new Vector2D(6, 8), 5).equals(new Vector2D(3, 4)), 'clamps magnitude');
expect(Vector2D.clampMagnitude(new Vector2D(6, 8), -5).equals(Vector2D.zero()), 'handles a negative magnitude limit safely');
expect(Vector2D.dot(new Vector2D(1, 2), new Vector2D(3, 4)) === 11, 'calculates dot product');
expect(Vector2D.distance(new Vector2D(1, 1), new Vector2D(4, 5)) === 5, 'calculates distance');
expect(Vector2D.distanceSquared(new Vector2D(1, 1), new Vector2D(4, 5)) === 25, 'calculates squared distance');
expect(Vector2D.lerp(new Vector2D(0, 2), new Vector2D(10, 6), 1.5).equals(new Vector2D(10, 6)), 'clamps interpolation amount');
expect(Vector2D.lerpUnclamped(new Vector2D(0, 2), new Vector2D(10, 6), 1.5).equals(new Vector2D(15, 8)), 'supports unclamped interpolation');
expect(Vector2D.moveTowards(new Vector2D(0, 0), new Vector2D(6, 8), 5).equals(new Vector2D(3, 4)), 'moves by maximum distance');
expect(Vector2D.moveTowards(new Vector2D(0, 0), new Vector2D(6, 8), -5).equals(new Vector2D(-3, -4)), 'moves away for a negative distance');
expect(Vector2D.reflect(new Vector2D(2, -3), new Vector2D(0, 1)).equals(new Vector2D(2, 3)), 'reflects from a normal');
expect(Vector2D.project(new Vector2D(3, 4), new Vector2D(1, 0)).equals(new Vector2D(3, 0)), 'projects onto another vector');
expect(Vector2D.project(new Vector2D(3, 4), Vector2D.zero()).equals(Vector2D.zero()), 'handles a zero projection basis');
expect(close(Vector2D.angle(Vector2D.right(), Vector2D.up()), 90), 'returns angle in degrees');
expect(new Vector2D(2, 1).rotatedBy(Math.PI / 2).equalsApprox(new Vector2D(-1, 2)), 'rotates by radians');
expect(Vector2D.rotate(Vector2D.right(), Math.PI / 2).equalsApprox(Vector2D.up()), 'rotates as a static operation');
expect(Vector2D.perpendicular(Vector2D.right()).equals(Vector2D.up()), 'returns a perpendicular vector');
expect(Vector2D.signedAngle(Vector2D.up(), Vector2D.right()) === -90, 'preserves signed angle direction');
expect(close(Vector2D.signedAngle(Vector2D.right(), Vector2D.up()), 90), 'returns signed angle in degrees');
expect(Vector2D.zero().equals(new Vector2D(0, 0)), 'creates a safe zero vector');
const zeroVector = new Vector2D();
const normalizedZero = zeroVector.normalized;
expect(normalizedZero.equals(Vector2D.zero()), 'normalizes zero safely');
expect(JSON.stringify(new Vector2D(7, 9)) === '{"x":7,"y":9}', 'serializes as plain x/y JSON');

console.log('Vector2D runtime fixtures passed');
