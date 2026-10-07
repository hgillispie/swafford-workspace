import { describe, expect, it } from "vitest";

import { pulseAsyncPhase } from "./pulse-async";

describe("pulseAsyncPhase", () => {
  it("keeps a fresh read on the skeleton", () => {
    expect(
      pulseAsyncPhase({ pending: true, stalled: false, isError: false }),
    ).toBe("loading");
  });

  it("turns a read that never settles into an error", () => {
    expect(
      pulseAsyncPhase({ pending: true, stalled: true, isError: false }),
    ).toBe("error");
  });

  it("surfaces a failed read instead of an empty week", () => {
    expect(
      pulseAsyncPhase({ pending: false, stalled: false, isError: true }),
    ).toBe("error");
  });

  it("renders stored or empty content once the read settles", () => {
    expect(
      pulseAsyncPhase({ pending: false, stalled: false, isError: false }),
    ).toBe("ready");
  });
});
