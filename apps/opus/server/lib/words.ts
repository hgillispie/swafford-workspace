export interface TranscriptWord {
  text: string;
  startMs: number;
  endMs: number;
  speaker?: string;
}

export function parseWords(raw: string | null | undefined): TranscriptWord[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const word = item as Record<string, unknown>;
      const text = typeof word.text === "string" ? word.text.trim() : "";
      const startMs = Number(word.startMs);
      const endMs = Number(word.endMs);
      if (!text || !Number.isFinite(startMs) || !Number.isFinite(endMs)) {
        return [];
      }
      return [
        {
          text,
          startMs,
          endMs,
          speaker: typeof word.speaker === "string" ? word.speaker : undefined,
        },
      ];
    });
  } catch {
    return [];
  }
}
