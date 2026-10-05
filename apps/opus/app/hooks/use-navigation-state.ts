import { appBasePath, appPath } from "@agent-native/core/client/api-path";
import { useAgentRouteState } from "@agent-native/core/client/navigation";

import { TAB_ID } from "@/lib/tab-id";

export interface NavigationState {
  view: string;
  path?: string;
  projectId?: string;
}

export function useNavigationState() {
  useAgentRouteState<NavigationState>({
    browserTabId: TAB_ID,
    requestSource: TAB_ID,
    getNavigationState: ({ pathname }) => {
      const projectId = projectIdFromPath(pathname);
      return {
        view: projectId ? "project" : "studio",
        path: appPath(pathname),
        ...(projectId ? { projectId } : {}),
      };
    },
    getCommandPath: (command) =>
      routerPath(command.path || pathForCommand(command)),
  });
}

function projectIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/projects\/([^/]+)$/);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

function pathForCommand(command: {
  view?: string;
  projectId?: string;
}): string {
  if (command.view === "project" && command.projectId) {
    return `/projects/${encodeURIComponent(command.projectId)}`;
  }
  return "/";
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
