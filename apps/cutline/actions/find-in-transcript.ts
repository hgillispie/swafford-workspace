import { defineAction, fail } from "@agent-native/core/action";
import { z } from "zod";

import {
  loadSpeakers,
  loadWords,
  mediaDuration,
  readProject,
} from "../server/lib/projects.js";
import {
  buildComposition,
  formatTimecode,
  normalizeToken,
  srcToOut,
} from "../shared/transcript.js";

export default defineAction({
  description:
    "Find every occurrence of a word or phrase in a project's transcript (case- and punctuation-insensitive). Returns exact inclusive word positions (from/to) for set-words-deleted, plus timecode, speaker, and surrounding context.",
  schema: z.object({
    projectId: z.string().min(1).describe("Project id"),
    query: z.string().trim().min(1).max(300).describe("Word or phrase to find"),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(200)
      .default(50)
      .describe("Maximum matches (1-200); defaults to 50"),
  }),
  http: { method: "GET" },
  readOnly: true,
  run: async ({ projectId, query, limit }) => {
    const project = await readProject(projectId);
    const tokens = query.split(/\s+/).map(normalizeToken).filter(Boolean);
    if (tokens.length === 0)
      fail("Query has no searchable words.", { errorCode: "empty_query" });
    const [words, speakers] = await Promise.all([
      loadWords(projectId),
      loadSpeakers(projectId),
    ]);
    const names = new Map(speakers.map((s) => [s.id, s.name]));
    const composition = buildComposition(words, mediaDuration(project, words));
    const normalized = words.map((w) => normalizeToken(w.text));
    const matches = [];
    let total = 0;
    for (let i = 0; i + tokens.length <= words.length; i++) {
      let ok = true;
      for (let k = 0; k < tokens.length; k++) {
        if (normalized[i + k] !== tokens[k]) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      total += 1;
      if (matches.length >= limit) continue;
      const span = words.slice(i, i + tokens.length);
      const before = words
        .slice(Math.max(0, i - 6), i)
        .map((w) => w.text)
        .join(" ");
      const after = words
        .slice(i + tokens.length, i + tokens.length + 6)
        .map((w) => w.text)
        .join(" ");
      matches.push({
        from: span[0].position,
        to: span[span.length - 1].position,
        text: span.map((w) => w.text).join(" "),
        time: formatTimecode(srcToOut(composition, span[0].startMs)),
        speaker: span[0].speakerId
          ? (names.get(span[0].speakerId) ?? null)
          : null,
        cut: span.every((w) => w.deleted),
        context:
          `${before} [${span.map((w) => w.text).join(" ")}] ${after}`.trim(),
      });
    }
    return { query, total, matches };
  },
});
