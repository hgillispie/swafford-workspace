import { defineAction } from "@agent-native/core/action";
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
  sentenceText,
  splitSentences,
  srcToOut,
} from "../shared/transcript.js";

export default defineAction({
  description:
    "Read a project's transcript as numbered sentences with word positions (from/to, inclusive), speaker, and edited timecode. Cut words appear as ~~word~~. Use the positions with set-words-deleted. Paginate with fromSentence/nextFromSentence.",
  schema: z.object({
    projectId: z.string().min(1).describe("Project id"),
    fromSentence: z.coerce
      .number()
      .int()
      .min(0)
      .default(0)
      .describe("Index of the first sentence to return; defaults to 0"),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(400)
      .default(150)
      .describe("Maximum sentences to return (1-400); defaults to 150"),
  }),
  http: { method: "GET" },
  readOnly: true,
  run: async ({ projectId, fromSentence, limit }) => {
    const project = await readProject(projectId);
    const [words, speakers] = await Promise.all([
      loadWords(projectId),
      loadSpeakers(projectId),
    ]);
    const names = new Map(speakers.map((s) => [s.id, s.name]));
    const composition = buildComposition(words, mediaDuration(project, words));
    const sentences = splitSentences(words);
    const page = sentences.slice(fromSentence, fromSentence + limit);
    const end = fromSentence + page.length;
    return {
      project: {
        id: project.id,
        title: project.title,
        transcriptStatus: project.transcriptStatus,
        sourceDuration: formatTimecode(mediaDuration(project, words)),
        editedDuration: formatTimecode(composition.durationMs),
        hasMedia: !!project.mediaUrl,
      },
      speakers: speakers.map((s) => ({ id: s.id, name: s.name })),
      totalWords: words.length,
      totalSentences: sentences.length,
      fromSentence,
      nextFromSentence: end < sentences.length ? end : null,
      sentences: page.map((sentence, i) => {
        const cutCount = sentence.words.filter((w) => w.deleted).length;
        const firstKept = sentence.words.find((w) => !w.deleted);
        return {
          index: fromSentence + i,
          from: sentence.from,
          to: sentence.to,
          speaker: sentence.speakerId
            ? (names.get(sentence.speakerId) ?? null)
            : null,
          time: formatTimecode(
            srcToOut(composition, (firstKept ?? sentence.words[0]).startMs),
          ),
          cut:
            cutCount === 0
              ? "none"
              : cutCount === sentence.words.length
                ? "all"
                : "partial",
          text: sentenceText(sentence.words, true),
        };
      }),
    };
  },
});
