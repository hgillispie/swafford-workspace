import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AsyncRegion } from "./chrome";

describe("AsyncRegion", () => {
  it("shows skeletons while a read is still inside the settle window", () => {
    const html = renderToStaticMarkup(
      <AsyncRegion
        pending
        isError={false}
        error={null}
        onRetry={() => {}}
        label="This week"
        skeleton={<div>skeleton</div>}
      >
        <div>ready</div>
      </AsyncRegion>,
    );
    expect(html).toContain("skeleton");
    expect(html).not.toContain("ready");
    expect(html).not.toContain("didn't load");
  });

  it("shows the action error instead of an empty week", () => {
    const error = Object.assign(
      new Error("Action pulse-get-latest failed: Sign in to use Pulse."),
      {
        actionMessage: "Sign in to use Pulse.",
      },
    );
    const html = renderToStaticMarkup(
      <AsyncRegion
        pending={false}
        isError
        error={error}
        onRetry={() => {}}
        label="This week"
        skeleton={<div>skeleton</div>}
      >
        <div>No pulse stored yet.</div>
      </AsyncRegion>,
    );
    expect(html).toContain("Sign in to use Pulse.");
    expect(html).toContain("Retry");
    expect(html).not.toContain("No pulse stored yet.");
  });

  it("renders the settled screen", () => {
    const html = renderToStaticMarkup(
      <AsyncRegion
        pending={false}
        isError={false}
        error={null}
        onRetry={() => {}}
        label="This week"
        skeleton={<div>skeleton</div>}
      >
        <div>No pulse stored yet.</div>
      </AsyncRegion>,
    );
    expect(html).toContain("No pulse stored yet.");
  });
});
