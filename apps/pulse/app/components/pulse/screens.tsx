import { sendToAgentChat } from "@agent-native/core/client/agent-chat";
import {
  useActionMutation,
  useActionQuery,
} from "@agent-native/core/client/hooks";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { FOLLOWER_LIKE_TARGET_PCT } from "../../../shared/pulse-guardrails";

const readOnce = { retry: false };
import { useState } from "react";
import { Link } from "react-router";

import {
  AsyncRegion,
  CardSkeleton,
  CopyPackButton,
  CopyTextButton,
  MetaLine,
  Panel,
  PulsePage,
} from "./chrome";

type Paste = {
  caption: string;
  capcut: string;
  descript: string;
  markdown: string;
};

type ShootCard = {
  id: string;
  title: string;
  hook: string;
  pillar: string;
  searchVsTrend: string;
  dynoSafe: boolean;
  assignee: string;
  status: string;
  priority: string;
  softCta: string;
  paste: Paste;
};

type Latest = {
  report: {
    id: string;
    reportDate: string;
    headline: string;
    mattBlurb: string;
    pdfDriveFileId: string | null;
    effectiveDynoUnlocked: boolean;
  } | null;
  cards: ShootCard[];
  postingWindows: {
    recommendedSlots: Array<{
      dayOfWeek: string;
      localTime: string;
      reason: string;
    }>;
    caveat: string;
  } | null;
  dataGaps: Array<{ message: string; severity: string }>;
  mix: { search: number; trend: number; hybrid: number };
  summary: string;
};

export function WeekScreen() {
  const latest = useActionQuery("pulse-get-latest", {}, readOnce);
  const data = latest.data as Latest | undefined;
  const lead = data?.cards[0];
  return (
    <PulsePage
      kicker="This week"
      title={data?.report?.headline ?? "Swafford Pulse"}
      action={
        lead ? (
          <CopyPackButton
            primary
            cardId={lead.id}
            format="caption"
            text={lead.paste.caption}
            label="Copy caption"
          />
        ) : null
      }
    >
      <AsyncRegion
        pending={latest.isPending}
        isError={latest.isError}
        error={latest.error}
        onRetry={() => void latest.refetch()}
        label="This week"
        skeleton={
          <>
            <CardSkeleton />
            <CardSkeleton />
          </>
        }
      >
        {!data?.report ? (
          <Panel>
            <p className="text-sm">
              No report yet. Brandbot sends them on its own. Shoot cards show up
              here when one arrives.
            </p>
            <Link
              to="/inbox"
              className="mt-3 inline-flex h-8 items-center rounded-md border border-border px-3 text-sm"
            >
              Check inbox
            </Link>
          </Panel>
        ) : (
          <>
            <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
              {data.report.mattBlurb}
            </p>
            <MetaLine
              items={[
                data.report.reportDate,
                `search ${data.mix.search}`,
                `trend ${data.mix.trend}`,
                `hybrid ${data.mix.hybrid}`,
                data.report.effectiveDynoUnlocked
                  ? "dyno unlocked"
                  : "dyno-safe",
              ]}
            />
            {data.dataGaps.length > 0 ? (
              <Panel>
                <h2 className="text-sm font-medium">Gaps</h2>
                <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                  {data.dataGaps.map((gap) => (
                    <li key={gap.message}>{gap.message}</li>
                  ))}
                </ul>
              </Panel>
            ) : null}
            <div className="grid gap-3">
              {data.cards.map((card) => (
                <ShootCardView key={card.id} card={card} />
              ))}
            </div>
            {data.postingWindows ? (
              <Panel>
                <h2 className="text-sm font-medium">Posting windows</h2>
                <ul className="mt-2 space-y-1 text-sm">
                  {data.postingWindows.recommendedSlots.map((slot) => (
                    <li key={`${slot.dayOfWeek}-${slot.localTime}`}>
                      {slot.dayOfWeek} {slot.localTime} ET — {slot.reason}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-muted-foreground">
                  {data.postingWindows.caveat}
                </p>
              </Panel>
            ) : null}
          </>
        )}
      </AsyncRegion>
    </PulsePage>
  );
}

function ShootCardView({ card }: { card: ShootCard }) {
  const update = useActionMutation("pulse-update-card-status");
  return (
    <Panel>
      <div className="flex flex-col gap-3">
        <div>
          <h2 className="font-medium">{card.title}</h2>
          <p className="mt-1 text-sm">{card.hook}</p>
          <MetaLine
            items={[
              card.pillar,
              card.searchVsTrend,
              card.dynoSafe ? "dyno-safe" : "dyno claim",
              card.assignee,
              card.status,
            ]}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <CopyPackButton
            primary
            cardId={card.id}
            format="caption"
            text={card.paste.caption}
            label="Caption"
          />
          <CopyPackButton
            cardId={card.id}
            format="capcut"
            text={card.paste.capcut}
            label="CapCut"
          />
          <CopyPackButton
            cardId={card.id}
            format="descript"
            text={card.paste.descript}
            label="Descript"
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={update.isPending}
            onClick={() => update.mutate({ id: card.id, status: "filmed" })}
          >
            Mark filmed
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() =>
              sendToAgentChat({
                openSidebar: true,
                submit: false,
                message: `Polish this Swafford shoot card in brand voice. Original footage only. Keep it dyno-safe unless dyno is unlocked. Card: ${card.title}. Hook: ${card.hook}`,
              })
            }
          >
            Polish in chat
          </Button>
        </div>
      </div>
    </Panel>
  );
}

export function ShootScreen() {
  const query = useActionQuery("pulse-list-recreate-cards", {}, readOnce);
  const cards = ((query.data as { cards?: ShootCard[] } | undefined)?.cards ??
    []) as ShootCard[];
  return (
    <PulsePage kicker="Shoot" title="Paste packs">
      <AsyncRegion
        pending={query.isPending}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
        label="Shoot cards"
        skeleton={<CardSkeleton />}
      >
        {cards.length === 0 ? (
          <Panel>
            <p className="text-sm">Cards land with the next pulse.</p>
          </Panel>
        ) : (
          <div className="grid gap-3">
            {cards.map((card) => (
              <ShootCardView key={card.id} card={card} />
            ))}
          </div>
        )}
      </AsyncRegion>
    </PulsePage>
  );
}

type Keyword = {
  id: string;
  term: string;
  intent: string;
  searchVsTrend: string;
  pillar: string;
  geo: string | null;
  source: string;
  related: string[];
  dynoSafe: boolean;
};

export function KeywordScreen() {
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  const query = useActionQuery("pulse-list-keywords", q ? { q } : {}, readOnce);
  const save = useActionMutation("pulse-upsert-keyword");
  const keywords = ((query.data as { keywords?: Keyword[] } | undefined)
    ?.keywords ?? []) as Keyword[];
  return (
    <PulsePage
      kicker="Keywords"
      title="Search seeds"
      action={
        <Button
          type="button"
          size="sm"
          onClick={() =>
            sendToAgentChat({
              openSidebar: true,
              submit: true,
              message:
                "Expand Swafford search keywords for electrical diagnosis, older Harley repair, and Greenville / Asheville shop language. Save the useful ones with pulse-upsert-keyword. Keep them dyno-safe.",
            })
          }
        >
          Expand with agent
        </Button>
      }
    >
      <Input
        value={q}
        onChange={(event) => setQ(event.target.value)}
        placeholder="Filter terms"
        aria-label="Filter keywords"
      />
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (!term.trim()) return;
          save.mutate(
            { term: term.trim(), intent: "how_to", searchVsTrend: "search" },
            { onSuccess: () => setTerm("") },
          );
        }}
      >
        <Input
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder="Add a search term"
          aria-label="New keyword"
        />
        <Button type="submit" disabled={save.isPending}>
          Save
        </Button>
      </form>
      <AsyncRegion
        pending={query.isPending}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
        label="Keywords"
        skeleton={<CardSkeleton />}
      >
        <ul className="divide-y divide-border rounded-lg border border-border bg-card">
          {keywords.map((row) => (
            <li key={row.id} className="px-4 py-3">
              <p className="text-sm font-medium">{row.term}</p>
              <MetaLine
                items={[
                  row.searchVsTrend,
                  row.intent,
                  row.pillar,
                  row.geo,
                  row.source,
                ]}
              />
              {row.related.length > 0 ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {row.related.join(", ")}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      </AsyncRegion>
    </PulsePage>
  );
}

type Account = {
  id: string;
  section: string;
  handle: string;
  displayName: string | null;
  role: string;
  followers: number | null;
  followerLikeHealthPct: number | null;
  medianViews: number | null;
  postsPerWeek: number | null;
  geo: string | null;
  notes: string | null;
};

export function CompetitorScreen() {
  const query = useActionQuery("pulse-list-competitors", {}, readOnce);
  const data = query.data as
    | {
        accounts?: Account[];
        localNotes?: string | null;
        reportDate?: string | null;
      }
    | undefined;
  const accounts = data?.accounts ?? [];
  return (
    <PulsePage kicker="Watchlist" title="Competitors">
      <AsyncRegion
        pending={query.isPending}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
        label="Watchlist"
        skeleton={<CardSkeleton />}
      >
        {accounts.length === 0 ? (
          <Panel>
            <p className="text-sm">
              North stars show up after the first pulse.
            </p>
          </Panel>
        ) : (
          <>
            {data?.localNotes ? (
              <p className="text-sm text-muted-foreground">{data.localNotes}</p>
            ) : null}
            <ul className="grid gap-3">
              {accounts.map((row) => (
                <li key={row.id}>
                  <Panel>
                    <h2 className="text-sm font-medium">
                      {row.displayName || `@${row.handle}`}
                    </h2>
                    <MetaLine
                      items={[
                        `@${row.handle}`,
                        row.role,
                        row.section,
                        row.geo,
                        row.followers != null
                          ? `${row.followers} followers`
                          : null,
                        row.medianViews != null
                          ? `median ${Math.round(row.medianViews)}`
                          : null,
                        row.followerLikeHealthPct != null
                          ? `followers÷likes ${row.followerLikeHealthPct}%`
                          : null,
                      ]}
                    />
                    {row.notes ? (
                      <p className="mt-2 text-sm text-muted-foreground">
                        {row.notes}
                      </p>
                    ) : null}
                  </Panel>
                </li>
              ))}
            </ul>
          </>
        )}
      </AsyncRegion>
    </PulsePage>
  );
}

type Trend = {
  id: string;
  kind: string;
  label: string;
  classification: string;
  searchVsTrend: string;
  dynoSafe: boolean;
  whyNow: string | null;
  halfLifeDays: number | null;
};

export function TrendScreen() {
  const query = useActionQuery("pulse-list-trends", {}, readOnce);
  const trends = ((query.data as { trends?: Trend[] } | undefined)?.trends ??
    []) as Trend[];
  return (
    <PulsePage kicker="Discover" title="Trends">
      <AsyncRegion
        pending={query.isPending}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
        label="Trends"
        skeleton={<CardSkeleton />}
      >
        {trends.length === 0 ? (
          <Panel>
            <p className="text-sm">Trending terms arrive with the pulse.</p>
          </Panel>
        ) : (
          <ul className="grid gap-3">
            {trends.map((row) => (
              <li key={row.id}>
                <Panel>
                  <h2 className="text-sm font-medium">{row.label}</h2>
                  <MetaLine
                    items={[
                      row.kind,
                      row.classification,
                      row.searchVsTrend,
                      row.dynoSafe ? "dyno-safe" : "dyno claim",
                      row.halfLifeDays != null
                        ? `${row.halfLifeDays}d half-life`
                        : null,
                    ]}
                  />
                  {row.whyNow ? (
                    <p className="mt-2 text-sm">{row.whyNow}</p>
                  ) : null}
                  <Button
                    className="mt-3"
                    size="sm"
                    variant="outline"
                    type="button"
                    onClick={() =>
                      sendToAgentChat({
                        openSidebar: true,
                        submit: true,
                        message: `Draft an original Swafford shoot card inspired by the format “${row.label}”. Do not copy footage. Include hook, caption, CapCut scene outline (3–5s cuts), Descript beats, Pocket 4 / Osmo 360 / Mic Mini notes, and the soft CTA to swaffordspeed.com. Save it with pulse-upsert-idea.`,
                      })
                    }
                  >
                    Recreate as paste pack
                  </Button>
                </Panel>
              </li>
            ))}
          </ul>
        )}
      </AsyncRegion>
    </PulsePage>
  );
}

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

function HeatRow({
  label,
  cells,
}: {
  label: string;
  cells: Array<number | null>;
}) {
  return (
    <>
      <span className="text-xs uppercase text-muted-foreground">{label}</span>
      {cells.map((value, hour) => (
        <span
          key={`${label}-${hour}`}
          title={`${label} ${hour}:00`}
          className="h-4 rounded-[2px] bg-primary"
          style={{ opacity: 0.12 + (value ?? 0) * 0.88 }}
        />
      ))}
    </>
  );
}

export function TimingScreen() {
  const latest = useActionQuery("pulse-get-latest", {}, readOnce);
  const data = latest.data as Latest | undefined;
  const windows = data?.postingWindows as
    | (Latest["postingWindows"] & {
        heatmapProxy?: { days?: Array<Array<number | null>>; basis?: string };
      })
    | null
    | undefined;
  const days = windows?.heatmapProxy?.days ?? [];
  return (
    <PulsePage kicker="Timing" title="When to post">
      <AsyncRegion
        pending={latest.isPending}
        isError={latest.isError}
        error={latest.error}
        onRetry={() => void latest.refetch()}
        label="Timing"
        skeleton={<CardSkeleton />}
      >
        {!windows ? (
          <Panel>
            <p className="text-sm">Heatmap proxy arrives with the pulse.</p>
          </Panel>
        ) : (
          <>
            <ul className="space-y-2">
              {windows.recommendedSlots.map((slot) => (
                <li
                  key={`${slot.dayOfWeek}-${slot.localTime}`}
                  className="text-sm"
                >
                  <span className="font-medium uppercase">
                    {slot.dayOfWeek}
                  </span>{" "}
                  {slot.localTime} ET — {slot.reason}
                </li>
              ))}
            </ul>
            <Panel className="overflow-x-auto">
              <div className="grid min-w-[640px] grid-cols-[3rem_repeat(24,minmax(0,1fr))] gap-px">
                <span />
                {Array.from({ length: 24 }, (_, hour) => (
                  <span
                    key={hour}
                    className="text-center text-[10px] text-muted-foreground"
                  >
                    {hour}
                  </span>
                ))}
                {days.map((row, index) => (
                  <HeatRow
                    key={DAYS[index] ?? index}
                    label={DAYS[index] ?? ""}
                    cells={row}
                  />
                ))}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                {windows.caveat}
              </p>
            </Panel>
          </>
        )}
      </AsyncRegion>
    </PulsePage>
  );
}

type Idea = {
  id: string;
  title: string;
  notes: string | null;
  status: string;
  assignee: string;
  searchVsTrend: string;
  dynoSafe: boolean;
  pillar: string;
};

const NEXT: Record<string, string> = {
  idea: "filmed",
  filmed: "edited",
  edited: "posted",
  posted: "posted",
};

export function BacklogScreen() {
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<"search" | "trend">("search");
  const query = useActionQuery("pulse-list-ideas", {}, readOnce);
  const save = useActionMutation("pulse-upsert-idea");
  const ideas = ((query.data as { ideas?: Idea[] } | undefined)?.ideas ??
    []) as Idea[];
  return (
    <PulsePage kicker="Backlog" title="Idea to posted">
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault();
          if (!title.trim()) return;
          save.mutate(
            {
              title: title.trim(),
              searchVsTrend: kind,
              assignee: "matt",
              status: "idea",
            },
            { onSuccess: () => setTitle("") },
          );
        }}
      >
        <Input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="New shoot idea"
          aria-label="New idea"
        />
        <Button
          type="button"
          variant={kind === "search" ? "default" : "outline"}
          onClick={() => setKind("search")}
        >
          Search
        </Button>
        <Button
          type="button"
          variant={kind === "trend" ? "default" : "outline"}
          onClick={() => setKind("trend")}
        >
          Trend
        </Button>
        <Button type="submit" disabled={save.isPending}>
          Add
        </Button>
      </form>
      <AsyncRegion
        pending={query.isPending}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
        label="Backlog"
        skeleton={<CardSkeleton />}
      >
        <ul className="grid gap-2">
          {ideas.map((idea) => (
            <li key={idea.id}>
              <Panel className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium">{idea.title}</p>
                  <MetaLine
                    items={[
                      idea.status,
                      idea.assignee,
                      idea.searchVsTrend,
                      idea.dynoSafe ? "dyno-safe" : "dyno claim",
                    ]}
                  />
                </div>
                {idea.status !== "posted" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    type="button"
                    onClick={() =>
                      save.mutate({
                        id: idea.id,
                        title: idea.title,
                        status: NEXT[idea.status] as "filmed",
                        assignee:
                          idea.assignee === "hunter" ? "hunter" : "matt",
                        searchVsTrend: idea.searchVsTrend as "search",
                        dynoSafe: idea.dynoSafe,
                        pillar: idea.pillar,
                      })
                    }
                  >
                    Mark {NEXT[idea.status]}
                  </Button>
                ) : null}
              </Panel>
            </li>
          ))}
        </ul>
      </AsyncRegion>
    </PulsePage>
  );
}

type Audit = {
  handle: string;
  url: string | null;
  foundInPulse: boolean;
  followers: number | null;
  totalLikes: number | null;
  medianViews: number | null;
  followerLikeHealthPct: number | null;
  followerLikeHealthy: boolean | null;
  topicClusters: Array<{
    topic: string;
    posts: number;
    avgViews: number | null;
  }>;
  ideasFromWinners: Array<{
    title: string;
    note: string;
    views: number | null;
  }>;
  cta: { pass: boolean; issues: string[] };
  bestSlots: Array<{ dayOfWeek: string; localTime: string; reason: string }>;
  latestPosts: Array<{ caption?: string | null; views?: number | null }>;
  limitations: string[];
  methodology: string;
};

export function AuditScreen() {
  const [account, setAccount] = useState("");
  const [result, setResult] = useState<Audit | null>(null);
  const run = useActionMutation("pulse-audit-account");
  const history = useActionQuery("pulse-list-audits", {}, readOnce);
  return (
    <PulsePage kicker="Audit" title="Page insights">
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault();
          run.mutate(
            { account },
            {
              onSuccess: (payload) => {
                const body = payload as { audit?: Audit };
                setResult(body.audit ?? null);
              },
            },
          );
        }}
      >
        <div className="flex-1 space-y-1">
          <Label htmlFor="audit-account">TikTok URL or handle</Label>
          <Input
            id="audit-account"
            value={account}
            onChange={(event) => setAccount(event.target.value)}
            placeholder="@swaffordspeed"
          />
        </div>
        <Button type="submit" className="sm:self-end" disabled={run.isPending}>
          {run.isPending ? "Reading…" : "Audit"}
        </Button>
      </form>
      {result ? <AuditBody audit={result} /> : null}
      <Panel>
        <h2 className="text-sm font-medium">Saved</h2>
        <AsyncRegion
          pending={history.isPending}
          isError={history.isError}
          error={history.error}
          onRetry={() => void history.refetch()}
          label="Saved audits"
          skeleton={<div className="mt-3 h-8 animate-pulse rounded bg-muted" />}
        >
          <ul className="mt-2 space-y-1 text-sm">
            {(
              (
                history.data as {
                  audits?: Array<{ id: string; handle: string }>;
                }
              )?.audits ?? []
            ).map((row) => (
              <li key={row.id}>@{row.handle}</li>
            ))}
          </ul>
        </AsyncRegion>
      </Panel>
    </PulsePage>
  );
}

function AuditBody({ audit }: { audit: Audit }) {
  return (
    <div className="grid gap-3">
      <Panel>
        <h2 className="text-sm font-medium">@{audit.handle}</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {audit.methodology}
        </p>
        {audit.foundInPulse ? (
          <MetaLine
            items={[
              audit.followers != null ? `${audit.followers} followers` : null,
              audit.totalLikes != null ? `${audit.totalLikes} likes` : null,
              audit.medianViews != null
                ? `median views ${Math.round(audit.medianViews)}`
                : null,
              audit.followerLikeHealthPct != null
                ? `followers÷likes ${audit.followerLikeHealthPct}% (target ${FOLLOWER_LIKE_TARGET_PCT}%)`
                : null,
            ]}
          />
        ) : (
          <p className="mt-2 text-sm">
            This handle is not in the latest stored pulse, so the numbers stay
            blank.
          </p>
        )}
      </Panel>
      <Panel>
        <h2 className="text-sm font-medium">Topics</h2>
        <ul className="mt-2 space-y-1 text-sm">
          {audit.topicClusters.length === 0 ? (
            <li className="text-muted-foreground">No caption sample stored.</li>
          ) : (
            audit.topicClusters.map((topic) => (
              <li key={topic.topic}>
                {topic.topic} — {topic.posts} posts
                {topic.avgViews != null ? `, avg views ${topic.avgViews}` : ""}
              </li>
            ))
          )}
        </ul>
      </Panel>
      <Panel>
        <h2 className="text-sm font-medium">Ideas from winners</h2>
        <ul className="mt-2 space-y-2 text-sm">
          {audit.ideasFromWinners.map((idea) => (
            <li key={idea.note}>{idea.note}</li>
          ))}
        </ul>
      </Panel>
      <Panel>
        <h2 className="text-sm font-medium">CTA check</h2>
        <p className="mt-2 text-sm">
          {audit.cta.pass
            ? "Outcome CTAs look fine."
            : audit.cta.issues.join(" ")}
        </p>
      </Panel>
      <Panel>
        <h2 className="text-sm font-medium">Best slots (pulse proxy)</h2>
        <ul className="mt-2 text-sm">
          {audit.bestSlots.map((slot) => (
            <li key={`${slot.dayOfWeek}-${slot.localTime}`}>
              {slot.dayOfWeek} {slot.localTime} — {slot.reason}
            </li>
          ))}
        </ul>
      </Panel>
      {audit.latestPosts.length > 0 ? (
        <Panel>
          <h2 className="text-sm font-medium">Latest stored posts</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {audit.latestPosts.map((post) => (
              <li key={post.caption ?? "post"}>
                {post.caption ?? "Untitled"}{" "}
                {post.views != null ? `· ${post.views} views` : ""}
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
      <Panel>
        <h2 className="text-sm font-medium">Limits</h2>
        <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-muted-foreground">
          {audit.limitations.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <Button
          className="mt-3"
          size="sm"
          variant="outline"
          type="button"
          onClick={() =>
            sendToAgentChat({
              openSidebar: true,
              submit: true,
              message: `Deepen the stored Pulse audit for @${audit.handle}. Use only numbers already in Pulse. Coach follower÷likes toward ${FOLLOWER_LIKE_TARGET_PCT}% or higher, 50/50 search vs trend, metadata stack, and soft outcome CTAs. Do not scrape TikTok.`,
            })
          }
        >
          Ask the agent to deepen
        </Button>
      </Panel>
    </div>
  );
}

type InboxReport = {
  id: string;
  reportDate: string;
  source: string;
  headline: string;
};

type InboxStatus = {
  canPaste?: boolean;
  reports?: InboxReport[];
  summary?: string;
};

function formatReportDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return iso;
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function sourceLabel(source: string): string {
  if (source === "tiktok") return "TikTok";
  if (source === "youtube") return "YouTube";
  return source;
}

export function InboxScreen() {
  const [json, setJson] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const ingest = useActionMutation("pulse-ingest-from-drive");
  const status = useActionQuery("pulse-ingest-status", {}, readOnce);
  const data = status.data as InboxStatus | undefined;
  const reports = data?.reports ?? [];
  return (
    <PulsePage
      kicker="Inbox"
      title="Reports"
      action={
        reports.length > 0 ? (
          <Link
            to="/home"
            className="inline-flex h-8 items-center rounded-md border border-border px-3 text-sm"
          >
            Open this week
          </Link>
        ) : null
      }
    >
      <AsyncRegion
        pending={status.isPending}
        isError={status.isError}
        error={status.error}
        onRetry={() => void status.refetch()}
        label="Reports"
        skeleton={
          <div className="space-y-3 rounded-lg border border-border bg-card p-4">
            <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
            <div className="h-3 w-full animate-pulse rounded bg-muted" />
            <div className="h-3 w-4/5 animate-pulse rounded bg-muted" />
          </div>
        }
      >
        <Panel>
          <p className="text-sm">
            Brandbot sends each report here on its own. It shows up on This week
            when it arrives.
          </p>
          {reports.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Nothing has arrived yet.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-border">
              {reports.map((report) => (
                <li key={report.id} className="py-3 first:pt-0 last:pb-0">
                  <p className="text-sm font-medium">{report.headline}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatReportDate(report.reportDate)} ·{" "}
                    {sourceLabel(report.source)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        {data?.canPaste ? (
          <details className="rounded-lg border border-border bg-card px-4 py-3">
            <summary className="cursor-pointer text-sm text-muted-foreground">
              Paste a report by hand
            </summary>
            <form
              className="mt-3 grid gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                ingest.mutate(
                  { json },
                  {
                    onSuccess: (payload) => {
                      const body = payload as { message?: string };
                      setNote(body.message ?? "Stored.");
                      setJson("");
                      void status.refetch();
                    },
                  },
                );
              }}
            >
              <p className="text-sm text-muted-foreground">
                Use this only when a report did not arrive. Paste the report
                text.
              </p>
              <Label htmlFor="pulse-json">Report text</Label>
              <textarea
                id="pulse-json"
                value={json}
                onChange={(event) => setJson(event.target.value)}
                className="min-h-36 rounded-md border border-input bg-background p-3 font-mono text-xs"
                placeholder="Paste the report here"
              />
              <Button type="submit" disabled={ingest.isPending || !json.trim()}>
                {ingest.isPending ? "Saving…" : "Store report"}
              </Button>
              {note ? <p className="text-sm">{note}</p> : null}
            </form>
          </details>
        ) : null}
      </AsyncRegion>
    </PulsePage>
  );
}

export function AdminScreen() {
  const settings = useActionQuery("pulse-get-settings", {}, readOnce);
  const save = useActionMutation("pulse-set-settings");
  const data = settings.data as
    | {
        dynoUnlocked?: boolean;
        canToggle?: boolean;
        payloadDynoUnlocked?: boolean | null;
        summary?: string;
        workspaceId?: string;
        brandbotDelivery?:
          | "connected"
          | "not_set"
          | "other_workspace"
          | "invalid";
      }
    | undefined;
  return (
    <PulsePage kicker="Admin" title="Dyno lock">
      <AsyncRegion
        pending={settings.isPending}
        isError={settings.isError}
        error={settings.error}
        onRetry={() => void settings.refetch()}
        label="Dyno lock"
        skeleton={<CardSkeleton />}
      >
        <Panel>
          <p className="text-sm">{data?.summary}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            Brandbot payload says{" "}
            {data?.payloadDynoUnlocked == null
              ? "nothing yet"
              : data.payloadDynoUnlocked
                ? "unlocked"
                : "locked"}
            . The admin toggle is what Pulse enforces.
          </p>
          {data?.canToggle ? (
            <Button
              className="mt-4"
              type="button"
              disabled={save.isPending}
              onClick={() =>
                save.mutate(
                  { dynoUnlocked: !data.dynoUnlocked },
                  { onSuccess: () => void settings.refetch() },
                )
              }
            >
              {data.dynoUnlocked ? "Lock dyno claims" : "Unlock dyno claims"}
            </Button>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              Only an owner or admin can change this.
            </p>
          )}
        </Panel>
        {data?.workspaceId ? (
          <Panel className="mt-4">
            <h2 className="text-sm font-medium">Brandbot delivery</h2>
            <p className="mt-2 text-sm">
              {data.brandbotDelivery === "connected"
                ? "Brandbot reports are delivered to this workspace on their own."
                : data.brandbotDelivery === "other_workspace"
                  ? "Brandbot reports are set up for a different workspace, so they will not show up here."
                  : data.brandbotDelivery === "invalid"
                    ? "Brandbot delivery has a workspace id that is not valid, so reports are being turned away."
                    : "Brandbot delivery is not tied to a workspace yet. Until it is, reports may be turned away when more than one workspace exists."}
            </p>
            {data.brandbotDelivery !== "connected" ? (
              <>
                <p className="mt-3 text-xs text-muted-foreground">
                  Workspace id for this workspace. Give it to whoever manages
                  the site settings.
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <code className="rounded-md border border-border bg-muted px-2 py-1 font-mono text-xs break-all">
                    {data.workspaceId}
                  </code>
                  <CopyTextButton
                    text={data.workspaceId}
                    label="Workspace id"
                  />
                </div>
              </>
            ) : null}
          </Panel>
        ) : null}
      </AsyncRegion>
    </PulsePage>
  );
}
