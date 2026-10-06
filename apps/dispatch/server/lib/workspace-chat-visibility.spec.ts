import path from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

type LauncherApp = {
  id: string;
  isDispatch?: boolean;
  path?: string;
  url?: string | null;
};

describe("mounted Chat stays in Dispatch launchers", () => {
  it("lists path-mounted chat and hides the hosted starter", async () => {
    const file = path.resolve(
      import.meta.dirname,
      "../../node_modules/@agent-native/dispatch/dist/lib/workspace-apps.js",
    );
    const mod = (await import(pathToFileURL(file).href)) as {
      isWorkspaceAppVisibleInDefaultLaunchers: (app: LauncherApp) => boolean;
    };
    const visible = mod.isWorkspaceAppVisibleInDefaultLaunchers;

    expect(visible({ id: "chat" })).toBe(false);
    expect(
      visible({
        id: "chat",
        path: "/",
        url: "https://chat.agent-native.com",
      }),
    ).toBe(false);
    expect(
      visible({
        id: "chat",
        path: "/chat",
        url: "https://swafford-workspace.netlify.app/chat",
      }),
    ).toBe(true);
    expect(visible({ id: "dumps", path: "/dumps" })).toBe(true);
    expect(
      visible({ id: "dispatch", isDispatch: true, path: "/dispatch" }),
    ).toBe(false);
  });
});
