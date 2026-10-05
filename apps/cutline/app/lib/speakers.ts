const SPEAKER_BG = [
  "bg-speaker-1",
  "bg-speaker-2",
  "bg-speaker-3",
  "bg-speaker-4",
  "bg-speaker-5",
  "bg-speaker-6",
] as const;

const SPEAKER_TEXT = [
  "text-speaker-1",
  "text-speaker-2",
  "text-speaker-3",
  "text-speaker-4",
  "text-speaker-5",
  "text-speaker-6",
] as const;

export const SPEAKER_CSS_VARS = [
  "--speaker-1",
  "--speaker-2",
  "--speaker-3",
  "--speaker-4",
  "--speaker-5",
  "--speaker-6",
] as const;

export function speakerBg(index: number): string {
  return index < 0
    ? "bg-muted-foreground/40"
    : SPEAKER_BG[index % SPEAKER_BG.length];
}

export function speakerText(index: number): string {
  return index < 0
    ? "text-muted-foreground"
    : SPEAKER_TEXT[index % SPEAKER_TEXT.length];
}

export function speakerVar(index: number): string {
  return SPEAKER_CSS_VARS[Math.max(0, index) % SPEAKER_CSS_VARS.length];
}
