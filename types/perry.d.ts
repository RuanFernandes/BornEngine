declare module 'perry/thread' {
  export function spawn<T>(fn: () => T): Promise<T>;
  export function parallelMap<T, U>(items: T[], fn: (item: T) => U): U[];
}

declare const console: {
  log(...a: unknown[]): void;
  warn(...a: unknown[]): void;
  error(...a: unknown[]): void;
};

declare function setTimeout(handler: () => void, ms?: number): number;
