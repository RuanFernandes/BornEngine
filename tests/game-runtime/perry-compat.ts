class Base {
  readonly baseValue: number;

  constructor(value: number) {
    this.baseValue = value;
  }

  read(): number {
    return this.baseValue;
  }
}

class Middle extends Base {
  constructor(value: number) {
    super(value + 1);
  }

  read(): number {
    return super.read() + 1;
  }
}

class Leaf extends Middle {
  constructor(value: number) {
    super(value + 1);
  }
}

function identity<T>(value: T): T {
  return value;
}

function requireTrue(value: boolean, label: string): void {
  if (!value) {
    console.error('Perry compatibility failure: ' + label);
    process.exit(1);
  }
}

const leaf = new Leaf(3);
const leafAgain: Leaf = identity(leaf);
const values: Base[] = [leafAgain];
const first: Base = values[0];

requireTrue(first instanceof Leaf, 'multi-level instanceof');
requireTrue(first instanceof Middle, 'parent instanceof');
requireTrue(first.read() === 6, 'constructors, super, and override');
requireTrue(leafAgain.baseValue === 5, 'readonly property and subclass return');

class ComponentBase {}

class HealthProbe extends ComponentBase {
  value: number;

  constructor(value: number) {
    super();
    this.value = value;
  }
}

type ComponentConstructor<T extends ComponentBase> =
  new (...args: any[]) => T;

function findComponent<T extends ComponentBase>(
  components: ComponentBase[],
  type: ComponentConstructor<T>,
): T | null {
  for (let i = 0; i < components.length; i++) {
    if (components[i] instanceof type) {
      return components[i] as T;
    }
  }
  return null;
}

const componentList: ComponentBase[] = [new HealthProbe(80)];
const healthProbe: HealthProbe | null =
  findComponent(componentList, HealthProbe);
requireTrue(healthProbe !== null && healthProbe.value === 80,
  'generic constructor lookup and instanceof');
console.log('Perry compatibility fixture passed');
