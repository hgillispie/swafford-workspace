import { appBasePath, appPath } from "@agent-native/core/client/api-path";
import { useAgentRouteState } from "@agent-native/core/client/navigation";

import { TAB_ID } from "@/lib/tab-id";

export interface NavigationState {
  view: string;
  path?: string;
  threadId?: string;
}

export function useNavigationState() {
  useAgentRouteState<NavigationState>({
    browserTabId: TAB_ID,
    requestSource: TAB_ID,
    getNavigationState: ({ pathname }) => {
      const threadId = threadIdFromPath(pathname);
      return {
        view: viewForPath(pathname),
        path: appPath(pathname),
        ...(threadId ? { threadId } : {}),
      };
    },
    getCommandPath: (command) =>
      routerPath(command.path || pathForCommand(command)),
  });
}

function threadIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/chat\/([^/]+)/);
  if (!match) return null;
  try {
    const value = decodeURIComponent(match[1]).trim();
    return value || null;
  } catch {
    return null;
  }
}

function viewForPath(pathname: string): string {
  if (isChatPath(pathname)) return "chat";
  if (pathname.startsWith("/shoot")) return "shoot";
  if (pathname.startsWith("/keywords")) return "keywords";
  if (pathname.startsWith("/competitors")) return "competitors";
  if (pathname.startsWith("/trends")) return "trends";
  if (pathname.startsWith("/timing")) return "timing";
  if (pathname.startsWith("/backlog")) return "backlog";
  if (pathname.startsWith("/audit")) return "audit";
  if (pathname.startsWith("/inbox")) return "inbox";
  if (pathname.startsWith("/admin")) return "admin";
  if (pathname.startsWith("/database")) return "database";
  if (pathname.startsWith("/extensions")) return "extensions";
  if (pathname.startsWith("/observability")) return "observability";
  if (pathname.startsWith("/settings/agent") || pathname.startsWith("/agent")) {
    return "agent";
  }
  if (pathname.startsWith("/settings")) return "settings";
  if (pathname.startsWith("/team")) return "settings";
  if (pathname === "/home" || pathname === "/") return "week";
  return "week";
}

function pathForView(view?: string): string {
  switch (view) {
    case "chat":
      return "/chat";
    case "week":
    case "home":
    case "ask":
      return "/home";
    case "shoot":
      return "/shoot";
    case "keywords":
      return "/keywords";
    case "competitors":
      return "/competitors";
    case "trends":
      return "/trends";
    case "timing":
      return "/timing";
    case "backlog":
      return "/backlog";
    case "audit":
      return "/audit";
    case "inbox":
      return "/inbox";
    case "admin":
      return "/admin";
    case "database":
      return "/database";
    case "extensions":
      return "/extensions";
    case "observability":
      return "/observability";
    case "agent":
      return "/settings/agent";
    case "settings":
      return "/settings";
    case "team":
      return "/settings/organization";
    default:
      return "/home";
  }
}

function pathForCommand(command: any): string {
  const threadId =
    typeof command?.threadId === "string" ? command.threadId.trim() : "";
  if (threadId && (command?.view === "chat" || command?.view == null)) {
    return `/chat/${encodeURIComponent(threadId)}`;
  }
  return pathForView(command?.view);
}

function routerPath(path: string): string {
  const basePath = appBasePath();
  if (!basePath) return path;
  if (path === basePath) return "/";
  if (path.startsWith(`${basePath}/`)) {
    return path.slice(basePath.length) || "/";
  }
  return path;
}

function isChatPath(pathname: string): boolean {
  return pathname.startsWith("/chat/");
}
