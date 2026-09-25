class OverrideBase {
  update(dt: number): number {
    return dt;
  }
}

class OverrideChild extends OverrideBase {
  override update(dt: number): number {
    return super.update(dt) + 1;
  }
}

const probe: number = new OverrideChild().update(1);
console.log(probe);
