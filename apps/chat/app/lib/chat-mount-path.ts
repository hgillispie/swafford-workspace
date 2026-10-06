/**
 * Chat is mounted at `/chat` and its thread route is also `/chat/:threadId`.
 * Public thread URLs are therefore `/chat/chat/:threadId`.
 *
 * `appPath()` treats any path that already starts with the mount as finished.
 * `/chat/<threadId>` looks mounted, so the home handoff used to request
 * `/chat/chat-<id>` and the app 404'd. These helpers always join the mount
 * to a router path, and only peel a mount prefix when the remainder is a
 * real in-app route.
 */

const MOUNT_RELATIVE_ROOTS = new Set([
  "home",
  "settings",
  "database",
  "extensions",
  "observability",
  "team",
  "agent",
  "sign-in",
  "login",
  "signup",
]);

const LEGACY_THREAD_ID = /^chat-[A-Za-z0-9_-]+$/;

export function normalizeMountBase(value: string | undefined): string {
  if (!value || value === "/") return "";
  const trimmed = value.trim();
  if (!trimmed || trimmed === "/") return "";
  const normalized = trimmed.replace(/^\/+/, "").replace(/\/+$/, "");
  return normalized ? `/${normalized}` : "";
}

export function browserPathFromRouterPath(
  routerPathname: string,
  basePath: string,
): string {
  if (!routerPathname.startsWith("/")) return routerPathname;
  const base = normalizeMountBase(basePath);
  if (!base) return routerPathname;
  if (routerPathname === "/") return base;
  return `${base}${routerPathname}`;
}

export function routerPathFromCommand(path: string, basePath: string): string {
  const base = normalizeMountBase(basePath);
  if (!base) return path;
  if (path === base) return "/";
  if (!path.startsWith(`${base}/`)) return path;
  const remainder = path.slice(base.length) || "/";
  const first = remainder.split("/").filter(Boolean)[0] ?? "";
  if (first === "chat" || MOUNT_RELATIVE_ROOTS.has(first)) return remainder;
  return path;
}

/**
 * `/chat/chat-<id>` is the broken handoff URL when this app is mounted at
 * `/chat`. The thread route is the next segment: `/chat/chat/chat-<id>`.
 * Standalone (no mount) thread URLs use `/chat/<id>` and must be left alone.
 */
export function legacyMountedChatThreadRedirect(
  pathname: string,
  basePath: string,
): string | null {
  const base = normalizeMountBase(basePath);
  if (base !== "/chat") return null;
  const path = pathname.split(/[?#]/, 1)[0]?.replace(/\/+$/, "") || "/";
  if (!path.startsWith(`${base}/`)) return null;
  const rest = path.slice(base.length + 1);
  if (!rest || rest.includes("/") || !LEGACY_THREAD_ID.test(rest)) return null;
  return `${base}/chat/${rest}`;
}
