import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const queries = vi.hoisted(() => ({
  board: undefined as unknown,
  provider: { configured: true } as unknown,
}));

vi.mock("@agent-native/core/client/hooks", () => ({
  actionErrorMessage: () => undefined,
  useActionMutation: () => ({
    mutate: vi.fn(),
    isPending: false,
    error: null,
    data: undefined,
  }),
  useActionQuery: (name: string) =>
    name === "scout-provider-status"
      ? { isPending: false, data: queries.provider }
      : {
          isPending: queries.board === undefined,
          isFetching: false,
          error: null,
          data: queries.board,
          refetch: vi.fn(),
        },
}));
vi.mock("@agent-native/core/client/agent-chat", () => ({
  sendToAgentChat: vi.fn(),
}));
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
}));

import { IntelligenceScreen, KeywordScreen, StubScreen } from "./screens";

const base = {
  configured: true,
  breakouts: [],
  terms: [],
  watchlist: [
    {
      handle: "docharley",
      displayName: "Doc Harley",
      role: "watch",
      fetched: false,
      followers: null,
      outlierCount: 0,
    },
  ],
  recreates: [],
  drafts: [],
  audits: [],
  pulse: null,
  intelligence: null,
  seeds: [
    {
      term: "harley shop greenville",
      intent: "x",
      searchVsTrend: "search",
      volumeProxy: "low",
    },
  ],
  brand: { firstHourReply: "", dynoUnlocked: false },
};

function render(node: React.ReactNode, path = "/home") {
  return renderToString(<StaticRouter location={path}>{node}</StaticRouter>);
}

describe("Niche pulse states", () => {
  beforeEach(() => {
    queries.provider = { configured: true };
  });

  it("first visit with a key: one sentence, one button, and the Keywords link", () => {
    queries.board = base;
    const html = render(<IntelligenceScreen />);
    expect(html).toContain("Run your first pulse");
    expect(html).toContain("Run first pulse");
    expect(html).toContain('href="/keywords"');
    expect(html).toContain("Search keywords");
    expect(html).toContain("No TikTok login needed");
    // No filters, empty lists, or second pulse button yet.
    expect(html).not.toContain("Refresh pulse");
    expect(html).not.toContain("Breakouts show up");
    expect(html).not.toContain("Dyno-safe only");
  });

  it("first visit without a key: points at Settings and nothing else", () => {
    queries.provider = { configured: false };
    queries.board = { ...base, configured: false };
    const html = render(<IntelligenceScreen />);
    expect(html).toContain("needs a ScrapeCreators key");
    expect(html).toContain('href="/settings"');
    expect(html).not.toContain("Run first pulse");
    // The page's own panel replaces the top bar, so the message appears once.
    expect(html.match(/ScrapeCreators key/g)).toHaveLength(1);
  });

  it("with results: filters, plain labels, and the Keywords link", () => {
    queries.board = {
      ...base,
      breakouts: [
        {
          id: "v1",
          url: "https://tiktok.test/v1",
          handle: "docharley",
          caption: "No start fix",
          views: 120000,
          likes: 900,
          soundName: null,
          searchVsTrend: "search",
          geo: null,
          dynoSafe: true,
          outlier: true,
          outlierScore: 3.2,
        },
      ],
      terms: [
        {
          label: "twin cam no start",
          classification: "flash_24_72h",
          halfLifeDays: 2,
          whyNow: "spiking in SC",
          searchVsTrend: "trend",
          dynoSafe: true,
        },
      ],
    };
    const html = render(<IntelligenceScreen />);
    expect(html).toContain("Refresh pulse");
    expect(html).toContain("Search keywords");
    expect(html).toContain("Dyno-safe only");
    expect(html).toContain("All places");
    expect(html).toContain("3.2× its usual views");
    expect(html).toContain("fades in about 2 days");
    expect(html).toContain("See videos");
    expect(html).not.toContain("half-life");
    expect(html).not.toContain("× median");
    expect(html).not.toContain("Run first pulse");
  });
});

describe("Keywords and dead ends", () => {
  it("offers one-click starting points instead of a bare input", () => {
    queries.board = base;
    const html = render(<KeywordScreen />, "/keywords");
    expect(html).toContain("start with one of these");
    expect(html).toContain("harley shop greenville");
  });

  it("gives the Instagram stub a way back", () => {
    const html = render(<StubScreen platform="Instagram" />, "/instagram");
    expect(html).toContain('href="/home"');
    expect(html).toContain("Back to Niche pulse");
  });
});
