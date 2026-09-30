declare function bloom_script_supported(): number;
declare function bloom_script_create(
  permissionMask: number,
  maxMemoryBytes: number,
  maxStackBytes: number,
  maxInterruptChecks: number,
): number;
declare function bloom_script_load(handle: number, source: string): number;
declare function bloom_script_start(handle: number, selfId: string, x: number, y: number, z: number): number;
declare function bloom_script_update(
  handle: number,
  selfId: string,
  x: number,
  y: number,
  z: number,
  deltaTime: number,
): number;
declare function bloom_script_dispose(handle: number, selfId: string, x: number, y: number, z: number): number;
declare function bloom_script_command_count(handle: number): number;
declare function bloom_script_command_kind(handle: number, index: number): number;
declare function bloom_script_command_number(handle: number, index: number, slot: number): number;
declare function bloom_script_command_text(handle: number, index: number): string;
declare function bloom_script_clear_commands(handle: number): void;
declare function bloom_script_status(handle: number): number;
declare function bloom_script_error(handle: number): string;
declare function bloom_script_memory_used(handle: number): number;
declare function bloom_script_destroy(handle: number): void;

import type { ScriptLimits } from './script-component';

export function scriptRuntimeSupported(): boolean {
  return bloom_script_supported() !== 0;
}

export function createScriptVm(permissionMask: number, limits: ScriptLimits): number {
  return bloom_script_create(
    permissionMask,
    limits.maxMemoryBytes,
    limits.maxStackBytes,
    limits.maxInterruptChecks,
  );
}

export function loadScriptVm(handle: number, source: string): boolean {
  return bloom_script_load(handle, source) !== 0;
}

export function startScriptVm(handle: number, id: string, position: { x: number; y: number; z: number }): number {
  return bloom_script_start(handle, id, position.x, position.y, position.z);
}

export function updateScriptVm(
  handle: number,
  id: string,
  position: { x: number; y: number; z: number },
  deltaTime: number,
): number {
  return bloom_script_update(handle, id, position.x, position.y, position.z, deltaTime);
}

export function disposeScriptVm(handle: number, id: string, position: { x: number; y: number; z: number }): number {
  return bloom_script_dispose(handle, id, position.x, position.y, position.z);
}

export function scriptCommandCount(handle: number): number { return bloom_script_command_count(handle); }
export function scriptCommandKind(handle: number, index: number): number { return bloom_script_command_kind(handle, index); }
export function scriptCommandNumber(handle: number, index: number, slot: number): number {
  return bloom_script_command_number(handle, index, slot);
}
export function scriptCommandText(handle: number, index: number): string { return bloom_script_command_text(handle, index); }
export function clearScriptCommands(handle: number): void { bloom_script_clear_commands(handle); }
export function scriptVmStatus(handle: number): number { return bloom_script_status(handle); }
export function scriptVmError(handle: number): string { return bloom_script_error(handle); }
export function scriptVmMemoryUsed(handle: number): number { return bloom_script_memory_used(handle); }
export function destroyScriptVm(handle: number): void { bloom_script_destroy(handle); }
