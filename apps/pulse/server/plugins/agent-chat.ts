import "../register-secrets.js";
import {
  createAgentChatPlugin,
  loadActionsFromStaticRegistry,
  type AgentChatPluginOptions,
} from "@agent-native/core/server";
import * as workspaceServer from "@swafford-workspace/shared/server";
import actionsRegistry from "../../.generated/actions-registry.js";

const createWorkspaceAgentChatPlugin = (workspaceServer as Record<string, unknown>).createWorkspaceAgentChatPlugin;
const options = {
  appId: "pulse",
  actions: loadActionsFromStaticRegistry(actionsRegistry),
} satisfies AgentChatPluginOptions;

export default typeof createWorkspaceAgentChatPlugin === "function"
  ? (createWorkspaceAgentChatPlugin as (options: AgentChatPluginOptions) => unknown)(options)
  : createAgentChatPlugin(options);
