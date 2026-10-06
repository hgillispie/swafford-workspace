import { getH3App } from "@agent-native/core/server";
import { defineEventHandler, getMethod, getRequestURL } from "h3";

import {
  legacyMountedChatThreadRedirect,
  normalizeMountBase,
} from "../../app/lib/chat-mount-path.js";

function chatMountBase(): string {
  const env = import.meta.env as
    | { VITE_APP_BASE_PATH?: string; APP_BASE_PATH?: string }
    | undefined;
  return normalizeMountBase(
    process.env.VITE_APP_BASE_PATH ||
      process.env.APP_BASE_PATH ||
      env?.VITE_APP_BASE_PATH ||
      env?.APP_BASE_PATH,
  );
}

/**
 * Sends the post-login handoff `/chat/chat-<id>` to the real thread route
 * `/chat/chat/chat-<id>`. Nested `/chat/*` requests already reach this
 * function; that URL 404s inside the app because the thread route is
 * `/chat/:threadId` under the `/chat` mount.
 */
export default function legacyChatThreadRedirectPlugin(nitroApp: {
  h3App?: unknown;
}) {
  getH3App(nitroApp).use(
    defineEventHandler((event) => {
      const method = getMethod(event);
      if (method !== "GET" && method !== "HEAD") return;
      const url = getRequestURL(event);
      const target = legacyMountedChatThreadRedirect(
        url.pathname,
        chatMountBase(),
      );
      if (!target) return;
      const location = `${target}${url.search}`;
      return new Response(null, {
        status: 302,
        headers: {
          Location: location,
          "Cache-Control": "private, no-store",
        },
      });
    }),
  );
}
