import { appBasePath, appPath } from "@agent-native/core/client/api-path";
import { useAgentRouteState } from "@agent-native/core/client/navigation";

import { TAB_ID } from "@/lib/tab-id";

export interface NavigationState {
  view: string;
  path?: string;
  projectId?: string;
}

const STATIC_VIEWS: Record<string, string> = {
  "/": "projects",
  "/shared": "shared",
  "/templates": "templates",
  "/brand-kit": "brand-kit",
};

export function useNavigationState() {
  useAgentRouteState<NavigationState>({
    browserTabId: TAB_ID,
    requestSource: TAB_ID,
    getNavigationState: ({ pathname }) => {
      const projectId = projectIdFromPath(pathname);
      return {
        view: viewForPath(pathname),
        path: appPath(pathname),
        ...(projectId ? { projectId } : {}),
      };
    },
    getCommandPath: (command) =>
      routerPath(command.path || pathForCommand(command)),
  });
}

export function projectIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/projects\/([^/]+)/);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]).trim() || null;
  } catch {
    return null;
  }
}

function viewForPath(pathname: string): string {
  if (projectIdFromPath(pathname)) return "editor";
  if (pathname === "/settings" || pathname.startsWith("/settings/"))
    return "settings";
  return STATIC_VIEWS[pathname] ?? "projects";
}

function pathForCommand(command: {
  view?: string;
  projectId?: string;
}): string {
  if (command.projectId)
    return `/projects/${encodeURIComponent(command.projectId)}`;
  const match = Object.entries(STATIC_VIEWS).find(
    ([, view]) => view === command.view,
  );
  return match?.[0] ?? "/";
}

function routerPath(path: string): string {
  const basePath = appBasePath();
  if (!basePath) return path;
  if (path === basePath) return "/";
  if (path.startsWith(`${basePath}/`))
    return path.slice(basePath.length) || "/";
  return path;
}
