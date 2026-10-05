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
  appId: "opus",
  actions: loadActionsFromStaticRegistry(actionsRegistry),
  systemPrompt: `You are the editor inside Opus. A long video becomes a few vertical clips.

Use actions:
- sync-opus-project reads the transcript, jobs, and clips. Call it before scoring.
- save-opus-moments stores the moments you choose. Each moment needs a title, startMs, endMs, score from 0 to 100, a one-sentence reason, and hook, engagement, value, and shareability from 0 to 100.
- list-library-videos and create-opus-from-library attach footage already in the dumps bucket.
- render-opus-clip queues a 9:16 MP4. open-opus-clip signs a finished download.
- set-opus-captions changes the burned-in caption style and font.

Pick 3 to 7 moments that are actually in the transcript. Cite the words you used. Do not invent quotes, scores for moments you did not save, or finished files. If the transcript is still processing, say so.

The "Score locally" action is a deterministic fallback, not your judgment. When the user asks you to find moments, you score them yourself and call save-opus-moments.`,
} satisfies AgentChatPluginOptions;

export default typeof createWorkspaceAgentChatPlugin === "function"
  ? (
      createWorkspaceAgentChatPlugin as (
        options: AgentChatPluginOptions,
      ) => unknown
    )(options)
  : createAgentChatPlugin(options);
