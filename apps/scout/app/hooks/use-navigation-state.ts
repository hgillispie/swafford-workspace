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
  if (pathname.startsWith("/chat/")) return "chat";
  if (pathname === "/home" || pathname === "/") return "intelligence";
  if (pathname.startsWith("/keywords")) return "keywords";
  if (pathname.startsWith("/competitors")) return "competitors";
  if (pathname.startsWith("/trends")) return "trends";
  if (pathname.startsWith("/audit")) return "audit";
  if (pathname.startsWith("/timing")) return "timing";
  if (pathname.startsWith("/create")) return "create";
  if (pathname.startsWith("/recreates")) return "recreates";
  if (pathname.startsWith("/instagram")) return "instagram";
  if (pathname.startsWith("/shorts")) return "shorts";
  if (pathname.startsWith("/database")) return "database";
  if (pathname.startsWith("/extensions")) return "extensions";
  if (pathname.startsWith("/observability")) return "observability";
  if (pathname.startsWith("/settings/agent") || pathname.startsWith("/agent")) {
    return "agent";
  }
  if (pathname.startsWith("/settings")) return "settings";
  if (pathname.startsWith("/team")) return "settings";
  return "intelligence";
}

function pathForView(view?: string): string {
  switch (view) {
    case "chat":
      return "/home";
    case "home":
    case "ask":
    case "intelligence":
      return "/home";
    case "keywords":
      return "/keywords";
    case "competitors":
      return "/competitors";
    case "trends":
      return "/trends";
    case "audit":
      return "/audit";
    case "timing":
      return "/timing";
    case "create":
      return "/create";
    case "recreates":
      return "/recreates";
    case "instagram":
      return "/instagram";
    case "shorts":
      return "/shorts";
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
  const path = pathForView(command?.view);
  if (path !== "/home") return path;
  const threadId =
    typeof command?.threadId === "string" ? command.threadId.trim() : "";
  return threadId ? `/chat/${encodeURIComponent(threadId)}` : path;
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
