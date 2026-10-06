import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  writeAppStateForCurrentTab: vi.fn(),
}));

vi.mock("@agent-native/core/application-state", () => ({
  writeAppStateForCurrentTab: mocks.writeAppStateForCurrentTab,
}));

import action from "./navigate";

describe("navigate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.writeAppStateForCurrentTab.mockResolvedValue(undefined);
  });

  it("requires a view, project, or path", async () => {
    await expect(action.run({})).rejects.toThrow(
      "Pass a view, a projectId, or a path.",
    );
    expect(mocks.writeAppStateForCurrentTab).not.toHaveBeenCalled();
  });

  it("opens the projects library at /", async () => {
    const result = await action.run({ view: "projects" });

    expect(result).toBe("Navigating to /");
    expect(mocks.writeAppStateForCurrentTab).toHaveBeenCalledWith(
      "navigate",
      expect.objectContaining({ path: "/", view: "projects" }),
    );
  });

  it("opens a project in the editor", async () => {
    const result = await action.run({ view: "editor", projectId: "p 1" });

    expect(result).toBe("Navigating to /projects/p%201");
    const callArg = mocks.writeAppStateForCurrentTab.mock.calls[0][1];
    expect(callArg).toMatchObject({
      path: "/projects/p%201",
      projectId: "p 1",
    });
  });

  it("prefers an explicit path", async () => {
    const result = await action.run({ view: "shared", path: "/templates" });

    expect(result).toBe("Navigating to /templates");
  });

  it("stamps a unique _writeId on every write", async () => {
    await action.run({ view: "templates" });

    const callArg = mocks.writeAppStateForCurrentTab.mock.calls[0][1];
    expect(typeof callArg._writeId).toBe("string");
    expect(callArg._writeId.includes("-")).toBe(true);
  });
});
