export const MAX_CHAT_LENGTH = 240;
export const MAX_DISPLAY_NAME_LENGTH = 24;
export const MAX_MESSAGES_PER_SECOND = 4;

export type ChatParseResult =
  | { ok: true; text: string }
  | { ok: false; reason: "invalid-payload" | "empty" | "too-long" | "invalid-characters" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function parseChatMessage(payload: unknown): ChatParseResult {
  if (!isRecord(payload) || typeof payload.text !== "string") {
    return { ok: false, reason: "invalid-payload" };
  }
  const keys = Object.keys(payload);
  for (const key of keys) {
    if (key !== "text" && key !== "name" && key !== "sessionId") {
      return { ok: false, reason: "invalid-payload" };
    }
  }
  if ((payload.name !== undefined &&
       (typeof payload.name !== "string" || payload.name.length > MAX_DISPLAY_NAME_LENGTH)) ||
      (payload.sessionId !== undefined &&
       (typeof payload.sessionId !== "string" || payload.sessionId.length > 64))) {
    return { ok: false, reason: "invalid-payload" };
  }
  const text = payload.text.trim();
  if (text.length === 0) return { ok: false, reason: "empty" };
  if (text.length > MAX_CHAT_LENGTH) return { ok: false, reason: "too-long" };
  if (/[\u0000-\u001f\u007f]/.test(text)) return { ok: false, reason: "invalid-characters" };
  return { ok: true, text };
}

export function normalizeDisplayName(value: unknown): string {
  if (typeof value !== "string") return "Guest";
  const printable = value.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  const name = Array.from(printable).slice(0, MAX_DISPLAY_NAME_LENGTH).join("");
  return name.length === 0 ? "Guest" : name;
}
