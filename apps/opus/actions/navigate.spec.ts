import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  writeAppStateForCurrentTab: vi.fn(),
}));

vi.mock("@agent-native/core/application-state", () => ({
  writeAppStateForCurrentTab: mocks.writeAppStateForCurrentTab,
}));

import action from "./navigate";

const projectId = "2e790fd1-75ee-45de-a954-026849be4b37";

describe("navigate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.writeAppStateForCurrentTab.mockResolvedValue(undefined);
  });

  it("requires at least a view or a path", async () => {
    await expect(action.run({})).rejects.toThrow("Pass a view or path");
    expect(mocks.writeAppStateForCurrentTab).not.toHaveBeenCalled();
  });

  it("navigates by view and only includes provided keys", async () => {
    const result = await action.run({ view: "studio" });

    expect(result).toBe("Navigating to studio");
    expect(mocks.writeAppStateForCurrentTab).toHaveBeenCalledWith(
      "navigate",
      expect.objectContaining({ view: "studio" }),
    );
    const callArg = mocks.writeAppStateForCurrentTab.mock.calls[0][1];
    expect(callArg.path).toBeUndefined();
    expect(callArg.projectId).toBeUndefined();
    expect(Object.keys(callArg).sort()).toEqual(["_writeId", "view"]);
  });

  it("navigates by path when view is not given", async () => {
    const result = await action.run({ path: "/settings" });
    expect(result).toBe("Navigating to /settings");
  });

  it("prefers view over path in the response", async () => {
    const result = await action.run({ view: "studio", path: "/settings" });
    expect(result).toBe("Navigating to studio");
  });

  it("includes projectId when opening a project", async () => {
    await action.run({ view: "project", projectId });
    expect(mocks.writeAppStateForCurrentTab).toHaveBeenCalledWith(
      "navigate",
      expect.objectContaining({ view: "project", projectId }),
    );
  });

  it("requires a project id when navigating to a project", async () => {
    await expect(action.run({ view: "project" })).rejects.toThrow(
      "Pass projectId",
    );
  });

  it("stamps a unique _writeId on every write", async () => {
    await action.run({ view: "studio" });
    const callArg = mocks.writeAppStateForCurrentTab.mock.calls[0][1];
    expect(typeof callArg._writeId).toBe("string");
    expect(callArg._writeId.includes("-")).toBe(true);
  });
});
