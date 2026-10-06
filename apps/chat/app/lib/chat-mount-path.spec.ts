import { describe, expect, it } from "vitest";

import {
  browserPathFromRouterPath,
  legacyMountedChatThreadRedirect,
  routerPathFromCommand,
} from "./chat-mount-path";

const THREAD = "chat-fa2c9a9b-39d8-4f9e-b067-657802e70477";

describe("chat mount paths", () => {
  it("prefixes the /chat mount onto the thread route", () => {
    expect(browserPathFromRouterPath(`/chat/${THREAD}`, "/chat")).toBe(
      `/chat/chat/${THREAD}`,
    );
    expect(browserPathFromRouterPath("/home", "/chat")).toBe("/chat/home");
    expect(browserPathFromRouterPath(`/chat/${THREAD}`, "")).toBe(
      `/chat/${THREAD}`,
    );
  });

  it("keeps in-app thread paths and peels only real mounted routes", () => {
    expect(routerPathFromCommand(`/chat/${THREAD}`, "/chat")).toBe(
      `/chat/${THREAD}`,
    );
    expect(routerPathFromCommand(`/chat/chat/${THREAD}`, "/chat")).toBe(
      `/chat/${THREAD}`,
    );
    expect(routerPathFromCommand("/chat/home", "/chat")).toBe("/home");
    expect(routerPathFromCommand("/chat/settings/agent", "/chat")).toBe(
      "/settings/agent",
    );
    expect(routerPathFromCommand("/home", "/chat")).toBe("/home");
  });

  it("redirects the unprefixed handoff URL only while mounted at /chat", () => {
    expect(legacyMountedChatThreadRedirect(`/chat/${THREAD}`, "/chat")).toBe(
      `/chat/chat/${THREAD}`,
    );
    expect(legacyMountedChatThreadRedirect(`/chat/${THREAD}/`, "/chat")).toBe(
      `/chat/chat/${THREAD}`,
    );
    expect(
      legacyMountedChatThreadRedirect(`/chat/chat/${THREAD}`, "/chat"),
    ).toBeNull();
    expect(legacyMountedChatThreadRedirect("/chat/home", "/chat")).toBeNull();
    expect(
      legacyMountedChatThreadRedirect("/chat/sign-in", "/chat"),
    ).toBeNull();
    expect(legacyMountedChatThreadRedirect(`/chat/${THREAD}`, "")).toBeNull();
    expect(
      legacyMountedChatThreadRedirect(`/dumps/chat/${THREAD}`, "/dumps"),
    ).toBeNull();
  });
});
