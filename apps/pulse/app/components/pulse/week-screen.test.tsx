import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const latest = {
  isPending: false,
  isError: false,
  error: null as unknown,
  data: undefined as unknown,
  refetch: vi.fn(),
};

vi.mock("@agent-native/core/client/hooks", () => ({
  useActionQuery: () => latest,
  useActionMutation: () => ({ mutate: vi.fn(), isPending: false }),
  actionErrorMessage: (error: { actionMessage?: string } | null) =>
    error?.actionMessage,
}));

vi.mock("@agent-native/core/client/agent-chat", () => ({
  sendToAgentChat: vi.fn(),
}));

import { WeekScreen } from "./screens";

function renderWeek() {
  return renderToStaticMarkup(
    <MemoryRouter>
      <WeekScreen />
    </MemoryRouter>,
  );
}

describe("WeekScreen", () => {
  beforeEach(() => {
    latest.isPending = false;
    latest.isError = false;
    latest.error = null;
    latest.data = undefined;
  });

  it("shows two placeholders while this week is loading", () => {
    latest.isPending = true;
    const html = renderWeek();
    expect(html.match(/animate-pulse/g)?.length).toBeGreaterThanOrEqual(2);
    expect(html).not.toContain("No report yet.");
    expect(html).not.toContain("didn't load");
  });

  it("shows an error when the read fails", () => {
    latest.isError = true;
    latest.error = { actionMessage: "You are not a member of this workspace." };
    const html = renderWeek();
    expect(html).toContain("You are not a member of this workspace.");
    expect(html).toContain("Retry");
    expect(html).not.toContain("No report yet.");
  });

  it("shows the empty week when no pulse is stored", () => {
    latest.data = {
      report: null,
      cards: [],
      postingWindows: null,
      dataGaps: [],
      mix: { search: 0, trend: 0, hybrid: 0 },
      summary: "No pulse stored yet.",
    };
    const html = renderWeek();
    expect(html).toContain("No report yet.");
    expect(html).toContain("Check inbox");
    expect(html).not.toContain("animate-pulse");
  });
});
