import { writeFile } from "node:fs/promises";

export interface TimedWord {
  text: string;
  startMs: number;
  endMs: number;
}

const FONTS: Record<string, string> = {
  dejavu: "DejaVu Sans",
  liberation: "Liberation Sans",
  noto: "Noto Sans",
};

function fontName(font: string | undefined): string {
  return FONTS[font ?? ""] ?? FONTS.dejavu;
}

function assTime(ms: number): string {
  const clamped = Math.max(0, ms);
  const hours = Math.floor(clamped / 3_600_000);
  const minutes = Math.floor((clamped % 3_600_000) / 60_000);
  const seconds = Math.floor((clamped % 60_000) / 1000);
  const centis = Math.floor((clamped % 1000) / 10);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${hours}:${pad(minutes)}:${pad(seconds)}.${pad(centis)}`;
}

function escapeAss(text: string): string {
  return text.replace(/[{}\\]/g, "").replace(/\r?\n/g, " ");
}

interface Style {
  size: number;
  bold: number;
  outline: number;
  primary: string;
  highlight: string;
  alignment: number;
  marginV: number;
}

function styleFor(name: string, portrait: boolean): Style {
  const base = portrait ? 78 : 48;
  if (name === "bold") {
    return {
      size: base + 12,
      bold: -1,
      outline: 8,
      primary: "&H00FFFFFF",
      highlight: "&H0000D4FF",
      alignment: 2,
      marginV: portrait ? 220 : 70,
    };
  }
  if (name === "minimal") {
    return {
      size: base - 16,
      bold: 0,
      outline: 2,
      primary: "&H00F2F2F2",
      highlight: "&H00F2F2F2",
      alignment: 2,
      marginV: portrait ? 160 : 48,
    };
  }
  if (name === "karaoke") {
    return {
      size: base,
      bold: -1,
      outline: 6,
      primary: "&H00FFFFFF",
      highlight: "&H0000E5FF",
      alignment: 2,
      marginV: portrait ? 240 : 80,
    };
  }
  return {
    size: base,
    bold: 0,
    outline: 5,
    primary: "&H00FFFFFF",
    highlight: "&H00FFFFFF",
    alignment: 2,
    marginV: portrait ? 200 : 64,
  };
}

function header(width: number, height: number, style: Style, font: string): string {
  return `[Script Info]
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Caption,${font},${style.size},${style.primary},${style.highlight},&H00000000,&H64000000,${style.bold},0,0,0,100,100,0,0,1,${style.outline},0,${style.alignment},60,60,${style.marginV},1
Style: Title,${font},${Math.round(style.size * 0.72)},&H00FFFFFF,&H00FFFFFF,&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,4,0,8,80,80,90,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
}

/** Animated word captions. Times are relative to the clip start. */
export function animatedAss(input: {
  words: TimedWord[];
  width: number;
  height: number;
  style: string;
  font?: string;
  title?: string;
  titleMs?: number;
}): string {
  const portrait = input.height > input.width;
  const look = styleFor(input.style, portrait);
  const font = fontName(input.font);
  let body = header(input.width, input.height, look, font);
  if (input.title) {
    const end = Math.max(800, input.titleMs ?? 2800);
    body += `Dialogue: 1,${assTime(0)},${assTime(end)},Title,,0,0,0,,${escapeAss(input.title)}\n`;
  }
  const groups: TimedWord[][] = [];
  let current: TimedWord[] = [];
  let chars = 0;
  for (const word of input.words) {
    const next = chars + word.text.length + 1;
    if (current.length > 0 && (next > 28 || current.length >= 5)) {
      groups.push(current);
      current = [];
      chars = 0;
    }
    current.push(word);
    chars += word.text.length + 1;
  }
  if (current.length > 0) groups.push(current);
  for (const group of groups) {
    const start = group[0].startMs;
    const end = Math.max(group[group.length - 1].endMs, start + 280);
    const karaoke = group
      .map((word) => {
        const centis = Math.max(
          1,
          Math.round((Math.max(word.endMs, word.startMs + 80) - word.startMs) / 10),
        );
        return `{\\kf${centis}}${escapeAss(word.text)}`;
      })
      .join(" ");
    body += `Dialogue: 0,${assTime(start)},${assTime(end)},Caption,,0,0,0,,${karaoke}\n`;
  }
  return body;
}

export function phraseAss(input: {
  cues: Array<{ startMs: number; endMs: number; text: string }>;
  width: number;
  height: number;
  font?: string;
}): string {
  const look = styleFor("classic", input.height > input.width);
  let body = header(input.width, input.height, look, fontName(input.font));
  for (const cue of input.cues) {
    body += `Dialogue: 0,${assTime(cue.startMs)},${assTime(cue.endMs)},Caption,,0,0,0,,${escapeAss(cue.text)}\n`;
  }
  return body;
}

export async function writeAss(file: string, contents: string): Promise<void> {
  await writeFile(file, contents, "utf8");
}
