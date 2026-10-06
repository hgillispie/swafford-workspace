import { appBasePath } from "@agent-native/core/client/api-path";
import { markAgentChatHomeHandoff } from "@agent-native/toolkit/app/chat/agentkit-chat/rail";
import { useEffect, useRef, useState } from "react";

import { APP_TITLE } from "@/lib/app-config";
import { getChatHomeThreadId } from "@/lib/chat-home-thread";
import { browserPathFromRouterPath } from "@/lib/chat-mount-path";

const SEO_TITLE = APP_TITLE;
const SEO_DESCRIPTION =
  "Free-form conversation for notes, writing, brainstorming, and everyday questions.";

export function meta() {
  return [
    { title: SEO_TITLE },
    {
      name: "description",
      content: SEO_DESCRIPTION,
    },
    { property: "og:title", content: SEO_TITLE },
    { property: "og:description", content: SEO_DESCRIPTION },
    { name: "twitter:card", content: "summary" },
    { name: "twitter:title", content: SEO_TITLE },
    { name: "twitter:description", content: SEO_DESCRIPTION },
  ];
}

export default function ChatRoute() {
  const [threadId] = useState(getChatHomeThreadId);
  const handoffStartedRef = useRef(false);

  useEffect(() => {
    if (handoffStartedRef.current) return;
    handoffStartedRef.current = true;
    markAgentChatHomeHandoff("chat");
    try {
      window.location.replace(
        browserPathFromRouterPath(
          `/chat/${encodeURIComponent(threadId)}`,
          appBasePath(),
        ),
      );
    } catch (error) {
      handoffStartedRef.current = false;
      throw error;
    }
  }, [threadId]);

  return null;
}
