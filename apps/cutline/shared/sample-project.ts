export interface SampleWord {
  text: string;
  startMs: number;
  endMs: number;
  speakerKey: string;
  paragraphStart: boolean;
}

export interface SampleTranscript {
  title: string;
  durationMs: number;
  speakers: Array<{ key: string; name: string }>;
  words: SampleWord[];
}

const SPEAKERS = [
  { key: "maya", name: "Maya Chen" },
  { key: "dev", name: "Dev Patel" },
];

const SCRIPT: Array<[string, string]> = [
  [
    "maya",
    "Hey, um, welcome back to Signal and Noise. I'm Maya, and today I'm talking with Dev Patel, who has edited, uh, something like four hundred episodes of other people's podcasts. [[pause:1600]] Dev, thanks for coming on.",
  ],
  [
    "dev",
    "Thanks for having me. It's, um, it's always a little strange to be on this side of the microphone.",
  ],
  [
    "maya",
    "So let's start with the obvious question. What makes an episode feel tight? [[pause:1400]] Like, what are you actually listening for?",
  ],
  [
    "dev",
    "Honestly, it's, uh, mostly the pauses. People think editing is about cutting the boring parts, but most of the time the content is fine. [[pause:1200]] It's the, you know, the dead air between thoughts that makes people drift off.",
  ],
  ["maya", "Okay, so you're not rewriting the conversation."],
  [
    "dev",
    "No, no. I'm, um, I'm protecting it. The goal is that the guest sounds like the best version of themselves on a good day. [[pause:2200]] So I'll take out the false starts, the ums, and the moments where someone, uh, loses the thread and circles back.",
  ],
  ["maya", "Do guests ever notice?"],
  [
    "dev",
    "Almost never. That's kind of the point. If they notice the edit, I did it wrong. [[pause:1300]] The best compliment I get is when someone says, wow, I sound smarter than I remember.",
  ],
  [
    "maya",
    "That's, um, that's a great place to pause. When we come back, I want to get into how you decide what to cut when an interview runs long.",
  ],
];

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function syllables(word: string): number {
  const clean = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!clean) return 1;
  const groups = clean.replace(/e$/, "").match(/[aeiouy]+/g);
  return Math.max(1, groups?.length ?? 1);
}

const FILLER = /^(um|uh),?$/i;

export function buildSampleTranscript(): SampleTranscript {
  const random = mulberry32(20261002);
  const words: SampleWord[] = [];
  let cursor = 650;
  let previousSpeaker: string | null = null;

  for (const [speakerKey, line] of SCRIPT) {
    if (previousSpeaker !== null) {
      cursor +=
        previousSpeaker === speakerKey ? 450 : 520 + Math.round(random() * 260);
    }
    let paragraphStart = true;
    let extraPause = 0;
    for (const token of line.split(/\s+/)) {
      const pause = token.match(/^\[\[pause:(\d+)\]\]$/);
      if (pause) {
        extraPause += Number(pause[1]);
        continue;
      }
      cursor += extraPause;
      extraPause = 0;
      const isFiller = FILLER.test(token);
      const duration = isFiller
        ? 300 + Math.round(random() * 120)
        : 110 + syllables(token) * (88 + Math.round(random() * 22));
      const startMs = Math.round(cursor);
      const endMs = Math.round(cursor + duration);
      words.push({ text: token, startMs, endMs, speakerKey, paragraphStart });
      paragraphStart = false;
      cursor = endMs;
      if (/[.?!]$/.test(token)) cursor += 380 + Math.round(random() * 160);
      else if (/,$/.test(token))
        cursor += isFiller ? 260 : 150 + Math.round(random() * 90);
      else cursor += 35 + Math.round(random() * 55);
    }
    previousSpeaker = speakerKey;
  }

  return {
    title: "Signal and Noise — sample episode",
    durationMs: Math.round(cursor + 900),
    speakers: SPEAKERS,
    words,
  };
}
