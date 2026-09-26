import { Matrix4 } from "@bornengine/engine";

const identity = Matrix4.identity();
const directIdentity = new Matrix4();
if (identity.elements.length !== 16 || directIdentity.elements.length !== 16) {
  throw new Error("Matrix4 identity construction smoke test failed");
}
const products = [
  Matrix4.multiplyMatrices(identity, identity),
  identity.multiply(identity),
  directIdentity.multiply(identity),
];

for (let productIndex = 0; productIndex < products.length; productIndex++) {
  const elements = products[productIndex].elements;
  for (let elementIndex = 0; elementIndex < 16; elementIndex++) {
    const expected = elementIndex % 5 === 0 ? 1 : 0;
    if (elements[elementIndex] !== expected) {
      throw new Error(`Matrix4 multiplication failed at element ${elementIndex}`);
    }
  }
}

console.log("Matrix4 native multiplication smoke test passed");
