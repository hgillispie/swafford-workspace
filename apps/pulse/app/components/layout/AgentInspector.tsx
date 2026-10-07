import { navigateWithAgentChatViewTransition } from "@agent-native/core/client/agent-chat";
import { useT } from "@agent-native/core/client/i18n";
import { focusAgentChat } from "@agent-native/toolkit/app/chat";
import { AgentSidebar } from "@agent-native/toolkit/app/chat";
import { type ReactNode } from "react";
import { useNavigate } from "react-router";

import { TAB_ID } from "@/lib/tab-id";

interface AgentInspectorProps {
  children: ReactNode;
  chatHomeHandoffActive: boolean;
  chatHomeHandoffPending: boolean;
}

/** Contextual inspector shell used on secondary chat routes. */
export function AgentInspector({
  children,
  chatHomeHandoffActive,
  chatHomeHandoffPending,
}: AgentInspectorProps) {
  const navigate = useNavigate();
  const t = useT();

  function openAskAgentFullscreen(threadId?: string) {
    focusAgentChat();
    navigateWithAgentChatViewTransition(
      navigate,
      threadId ? `/chat/${encodeURIComponent(threadId)}` : `/chat/${crypto.randomUUID()}`,
    );
  }

  return (
    <AgentSidebar
      position="right"
      chatViewTransition
      chatViewTransitionHandoff={chatHomeHandoffPending}
      storageKey="pulse"
      browserTabId={TAB_ID}
      openOnChatRunning={chatHomeHandoffActive}
      onFullscreenRequest={openAskAgentFullscreen}
      emptyStateText={t("chat.inspectEmptyState")}
      agentPageHref="/settings/agent"
      suggestions={[
        "Expand search keywords for older Harley repair and Greenville shop language.",
        "Polish this week's shoot cards. Original footage, dyno-safe, soft CTA.",
        "Coach the latest account audit: 50/50 mix, metadata stack, follower health.",
      ]}
    >
      {children}
    </AgentSidebar>
  );
}
