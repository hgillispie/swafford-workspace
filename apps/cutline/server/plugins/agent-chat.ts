import {
  createAgentChatPlugin,
  loadActionsFromStaticRegistry,
  type AgentChatPluginOptions,
} from "@agent-native/core/server";
import * as workspaceServer from "@swafford-workspace/shared/server";

import actionsRegistry from "../../.generated/actions-registry.js";

const createWorkspaceAgentChatPlugin = (
  workspaceServer as Record<string, unknown>
).createWorkspaceAgentChatPlugin;
const options = {
  appId: "cutline",
  actions: loadActionsFromStaticRegistry(actionsRegistry),
  systemPrompt: `You are the editing assistant inside Cutline. Users edit video by editing the transcript. Deleting a word cuts it from the edit. The original file in Backblaze is never modified until an export job renders a new MP4.

Use actions, not raw SQL:
- view-screen and get-transcript to read the open project. find-in-transcript locates phrases.
- set-words-deleted, remove-filler-words, shorten-gaps, correct-word, and update-speaker change the edit.
- list-library-videos and create-project-from-library attach footage already in the dumps bucket.
- export-video queues a full-quality render of the cut list. export-transcript downloads txt, srt, or vtt.
- navigate opens a project.

When asked to clean up, remove fillers and long gaps, then say what you cut with timecodes. For titles, summaries, or chapters, answer in chat from the transcript and cite timecodes. Do not invent quotes.

Transcription and export run as media-worker jobs. If a job is still running, say so instead of claiming the file is ready.`,
} satisfies AgentChatPluginOptions;

export default typeof createWorkspaceAgentChatPlugin === "function"
  ? (
      createWorkspaceAgentChatPlugin as (
        options: AgentChatPluginOptions,
      ) => unknown
    )(options)
  : createAgentChatPlugin(options);
