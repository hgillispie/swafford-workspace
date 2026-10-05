import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import {
  loadSpeakers,
  loadWords,
  mediaDuration,
  readProject,
} from "../server/lib/projects.js";
import { exportTranscript } from "../shared/transcript.js";

const MIME: Record<"txt" | "srt" | "vtt", string> = {
  txt: "text/plain",
  srt: "application/x-subrip",
  vtt: "text/vtt",
};

export default defineAction({
  description:
    "Export the edited transcript (cuts removed, timings follow the edit) as plain text with speakers (txt) or as captions (srt, vtt). Returns the filename, MIME type, and file content.",
  schema: z.object({
    projectId: z.string().min(1).describe("Project id"),
    format: z
      .enum(["txt", "srt", "vtt"])
      .default("txt")
      .describe('"txt", "srt", or "vtt"; defaults to "txt"'),
  }),
  http: { method: "GET" },
  readOnly: true,
  run: async ({ projectId, format }) => {
    const project = await readProject(projectId);
    const [words, speakers] = await Promise.all([
      loadWords(projectId),
      loadSpeakers(projectId),
    ]);
    const base =
      project.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80) || "transcript";
    return {
      filename: `${base}.${format}`,
      mimeType: MIME[format],
      content: exportTranscript(
        format,
        words,
        speakers,
        mediaDuration(project, words),
      ),
    };
  },
});
