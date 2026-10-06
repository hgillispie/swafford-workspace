import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  readAppState: vi.fn(),
}));

vi.mock("@agent-native/core/application-state", () => ({
  readAppState: mocks.readAppState,
}));

vi.mock("../server/db.js", () => ({ getDb: vi.fn(), schema: {} }));
vi.mock("@agent-native/core/sharing", () => ({
  accessFilter: vi.fn(),
  resolveAccess: vi.fn(),
}));

import action from "./view-screen";

describe("view-screen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns navigation for views without extra context", async () => {
    mocks.readAppState.mockResolvedValue({
      view: "settings",
      path: "/settings",
    });

    const result = await action.run({});

    expect(mocks.readAppState).toHaveBeenCalledWith("navigation");
    expect(result).toEqual({
      navigation: { view: "settings", path: "/settings" },
    });
  });

  it("returns a fallback message when there is no navigation state", async () => {
    mocks.readAppState.mockResolvedValue(null);

    const result = await action.run({});

    expect(result).toBe("No application state found. Is the app open?");
  });

  it("is marked read-only", () => {
    expect(action.readOnly).toBe(true);
  });
});
