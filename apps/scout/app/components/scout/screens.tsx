import { sendToAgentChat } from "@agent-native/core/client/agent-chat";
import { actionErrorMessage, useActionMutation, useActionQuery } from "@agent-native/core/client/hooks";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import {
  PULSE_SEED_STORAGE_KEY,
  pulseNeedsLiveSeed,
  pulseSeedAllowed,
} from "@shared/board";

import {
  ErrorNote,
  Panel,
  PendingIcon,
  RowsSkeleton,
  ScoutPage,
  copyText,
  formatCount,
} from "./chrome";

const MODEL_NOTE =
  "Use the strongest configured model, not a mini, flash, or haiku default. Dyno stays locked unless settings say otherwise. Original footage only. Soft booking CTA. No ripped footage.";

interface VideoHit {
  id: string;
  url: string;
  handle: string;
  caption: string;
  views: number | null;
  likes: number | null;
  soundName: string | null;
  searchVsTrend: "search" | "trend" | "hybrid";
  geo: string | null;
  dynoSafe: boolean;
  outlier: boolean;
  outlierScore: number | null;
}

interface WatchRow {
  handle: string;
  displayName: string;
  role: string;
  fetched: boolean;
  missed?: boolean;
  followers: number | null;
  outlierCount: number;
}

interface TermRow {
  label: string;
  classification: string;
  halfLifeDays: number;
  whyNow: string;
  searchVsTrend: string;
  dynoSafe: boolean;
}

interface PastePack {
  caption: string;
  capcut: string;
  descript: string;
  markdown: string;
}

interface RecreateRow {
  id: string;
  status: string;
  sourceHandle: string | null;
  card: {
    title: string;
    hook: string;
    growthPrincipleTags?: string[];
    softCta?: string;
  } | null;
  paste: PastePack | null;
}

interface Board {
  configured: boolean;
  breakouts: VideoHit[];
  terms: TermRow[];
  watchlist: WatchRow[];
  recreates: RecreateRow[];
  drafts: { id: string; kind: string; topic: string; body: string }[];
  audits: { id: string; handle: string; narrative: string | null }[];
  pulse: { headline: string; mattBlurb: string; reportDate: string } | null;
  intelligence: { id: string; narrative: string | null } | null;
  missedWarning?: string | null;
  seeds: { term: string; intent: string; searchVsTrend: string; volumeProxy: string }[];
  brand: { firstHourReply: string; dynoUnlocked: boolean };
}

function useBoard(filters: {
  searchVsTrend: "all" | "search" | "trend" | "hybrid";
  geo: "all" | "upstate_sc" | "wnc" | "east_tn" | "national";
  dyno: "all" | "safe";
}) {
  return useActionQuery("scout-list", filters);
}

export function IntelligenceScreen() {
  const [searchVsTrend, setSearchVsTrend] = useState<"all" | "search" | "trend" | "hybrid">("all");
  const [geo, setGeo] = useState<"all" | "upstate_sc" | "wnc" | "east_tn" | "national">("all");
  const [dyno, setDyno] = useState<"all" | "safe">("safe");
  const filters = { searchVsTrend, geo, dyno };
  const board = useBoard(filters);
  const refresh = useActionMutation("scout-intelligence-report");
  const data = board.data as Board | undefined;
  const seeded = useRef(false);
  const cold = data ? pulseNeedsLiveSeed(data) : false;
  useEffect(() => {
    if (!data || refresh.isPending || seeded.current || !pulseNeedsLiveSeed(data)) return;
    const now = Date.now();
    if (!pulseSeedAllowed(readPulseSeedAt(), now)) return;
    seeded.current = true;
    writePulseSeedAt(now);
    refresh.mutate(
      {},
      {
        onSuccess: () => {
          void board.refetch();
        },
        onError: (error) => {
          toast.error(actionMessage(error));
          void board.refetch();
        },
      },
    );
  }, [board, data, refresh]);
  const seeding = cold && (refresh.isPending || board.isFetching);
  const notice = noticeText(data, refresh.data);
  const untouched = (data?.watchlist.length ?? 0) > 0 && (data?.watchlist ?? []).every((row) => !row.fetched && !row.missed);
  return (
    <ScoutPage
      title="Niche pulse"
      action={
        <Button
          type="button"
          disabled={refresh.isPending}
          onClick={() =>
            refresh.mutate(
              {},
              {
                onSuccess: () => board.refetch(),
                onError: (error) => {
                  toast.error(actionMessage(error));
                  void board.refetch();
                },
              },
            )
          }
        >
          <PendingIcon pending={refresh.isPending} />
          Refresh pulse
        </Button>
      }
    >
      <FilterBar
        searchVsTrend={searchVsTrend}
        geo={geo}
        dyno={dyno}
        onSearch={setSearchVsTrend}
        onGeo={setGeo}
        onDyno={setDyno}
      />
      <ErrorNote error={refresh.error ?? board.error} />
      {cold ? <FirstRunNote pending={refresh.isPending} /> : null}
      {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}
      {board.isPending || seeding ? (
        <RowsSkeleton />
      ) : (
        <div className="grid gap-4">
          {data?.pulse ? (
            <Panel>
              <p className="text-sm">
                Latest Pulse · {data.pulse.reportDate} · {data.pulse.headline}
              </p>
              <Link to="/pulse" className="text-sm text-primary underline">
                Open Pulse
              </Link>
            </Panel>
          ) : null}
          <BreakoutList videos={data?.breakouts ?? []} untouched={untouched} />
          <TermList terms={data?.terms ?? []} untouched={untouched} />
          <WatchList
            rows={data?.watchlist ?? []}
            busy={refresh.isPending}
            onFetched={() => board.refetch()}
          />
          {data?.intelligence?.narrative ? (
            <Panel>
              <p className="whitespace-pre-wrap text-sm">{data.intelligence.narrative}</p>
            </Panel>
          ) : null}
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              sendToAgentChat({
                openSidebar: true,
                submit: true,
                effort: "high",
                message: `Write the niche pulse from the latest scout-intelligence-report packet. ${MODEL_NOTE} Save it with scout-save-report.`,
              })
            }
          >
            Write the brief
          </Button>
        </div>
      )}
    </ScoutPage>
  );
}

function FilterBar(props: {
  searchVsTrend: "all" | "search" | "trend" | "hybrid";
  geo: "all" | "upstate_sc" | "wnc" | "east_tn" | "national";
  dyno: "all" | "safe";
  onSearch: (value: "all" | "search" | "trend" | "hybrid") => void;
  onGeo: (value: "all" | "upstate_sc" | "wnc" | "east_tn" | "national") => void;
  onDyno: (value: "all" | "safe") => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <Select
        label="Search or trend"
        value={props.searchVsTrend}
        onChange={props.onSearch}
        options={[
          ["all", "All"],
          ["search", "Search"],
          ["trend", "Trend"],
          ["hybrid", "Hybrid"],
        ] as const}
      />
      <Select
        label="Geo"
        value={props.geo}
        onChange={props.onGeo}
        options={[
          ["all", "All geos"],
          ["upstate_sc", "Upstate SC"],
          ["wnc", "WNC"],
          ["east_tn", "East TN"],
          ["national", "National"],
        ] as const}
      />
      <Select
        label="Dyno"
        value={props.dyno}
        onChange={props.onDyno}
        options={[
          ["safe", "Dyno-safe"],
          ["all", "Include dyno claims"],
        ] as const}
      />
    </div>
  );
}

function Select<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: readonly [T, string][];
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="sr-only">{label}</span>
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        className="h-9 rounded-md border border-input bg-background px-2"
      >
        {options.map(([option, text]) => (
          <option key={option} value={option}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}

function BreakoutList({ videos, untouched = false }: { videos: VideoHit[]; untouched?: boolean }) {
  return (
    <div className="grid gap-2">
      {videos.length === 0 ? (
        <Panel>
          <p className="text-sm">
            {untouched ? "Breakouts land here after Refresh pulse." : "No breakouts in this filter."}
          </p>
        </Panel>
      ) : (
        videos.slice(0, 8).map((video) => <VideoRow key={video.id} video={video} />)
      )}
    </div>
  );
}

function VideoRow({ video }: { video: VideoHit }) {
  const navigate = useNavigate();
  const recreate = useActionMutation("scout-recreate");
  return (
    <Panel>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">@{video.handle}</p>
          <p className="line-clamp-2 text-sm text-muted-foreground">
            {video.caption || "No caption"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatCount(video.views)} views
            {video.outlierScore != null ? ` · ${video.outlierScore}× median` : ""}
            {video.soundName ? ` · ${video.soundName}` : ""}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          disabled={recreate.isPending}
          onClick={() =>
            recreate.mutate(
              {
                caption: video.caption || video.handle,
                handle: video.handle,
                url: video.url,
                soundName: video.soundName,
                searchVsTrend: video.searchVsTrend,
                geo: video.geo === "upstate_sc" || video.geo === "wnc" || video.geo === "east_tn" || video.geo === "national" ? video.geo : null,
                videoId: video.id,
              },
              {
                onSuccess: () => navigate("/recreates"),
                onError: (error) => toast.error(actionMessage(error)),
              },
            )
          }
        >
          <PendingIcon pending={recreate.isPending} />
          Recreate
        </Button>
      </div>
    </Panel>
  );
}

function TermList({ terms, untouched = false }: { terms: TermRow[]; untouched?: boolean }) {
  if (terms.length === 0) {
    return (
      <Panel>
        <p className="text-sm">
          {untouched
            ? "Trending terms land here after Refresh pulse."
            : "Trending terms land after Discover."}
        </p>
        {untouched ? null : (
          <Link to="/trends" className="text-sm text-primary underline">
            Discover trends
          </Link>
        )}
      </Panel>
    );
  }
  return (
    <div className="grid gap-2">
      {terms.map((term) => (
        <Panel key={term.label}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium">{term.label}</p>
              <p className="text-xs text-muted-foreground">
                {term.classification} · {term.halfLifeDays}d half-life · {term.whyNow}
              </p>
            </div>
            <Link
              to={`/keywords?term=${encodeURIComponent(term.label)}`}
              className="text-sm text-primary underline"
            >
              Videos
            </Link>
          </div>
        </Panel>
      ))}
    </div>
  );
}

function WatchList({
  rows,
  busy = false,
  onFetched,
}: {
  rows: WatchRow[];
  busy?: boolean;
  onFetched: () => void;
}) {
  const fetchOne = useActionMutation("scout-fetch-competitor");
  const watchAll = useActionMutation("scout-watch-seeds");
  const pending = rows.some((row) => !row.fetched && !row.missed);
  return (
    <div className="grid gap-2">
      {pending ? (
        <div className="flex justify-end">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy || fetchOne.isPending || watchAll.isPending}
            onClick={() =>
              watchAll.mutate(
                {},
                {
                  onSuccess: (result) => {
                    onFetched();
                    const payload = result as { message?: string; warning?: string | null };
                    if (payload.warning) toast(payload.warning);
                    else if (payload.message) toast.success(payload.message);
                  },
                  onError: (error) => toast.error(actionMessage(error)),
                },
              )
            }
          >
            <PendingIcon pending={watchAll.isPending} />
            Watch all seeds
          </Button>
        </div>
      ) : null}
      {rows.map((row) => (
        <Panel key={row.handle}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">{row.displayName}</p>
              <p className="text-xs text-muted-foreground">
                @{row.handle} · {row.role.replace(/_/g, " ")}
                {row.fetched
                  ? ` · ${formatCount(row.followers)} followers`
                  : row.missed
                    ? " · no public record"
                    : " · not fetched"}
                {row.outlierCount > 0 ? ` · ${row.outlierCount} breakouts` : ""}
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant={row.fetched ? "outline" : "default"}
              disabled={busy || fetchOne.isPending || watchAll.isPending}
              onClick={() =>
                fetchOne.mutate(
                  { handle: row.handle, role: row.role as "north_star" | "local" | "watch", displayName: row.displayName },
                  {
                    onSuccess: onFetched,
                    onError: (error) => toast.error(actionMessage(error)),
                  },
                )
              }
            >
              <PendingIcon pending={fetchOne.isPending} />
              {row.fetched ? "Refresh" : "Watch"}
            </Button>
          </div>
        </Panel>
      ))}
    </div>
  );
}

export function KeywordScreen() {
  const [params] = useSearchParams();
  const [query, setQuery] = useState(params.get("term") ?? "");
  const search = useActionMutation("scout-search-keywords");
  const hashtag = useActionMutation("scout-search-hashtags");
  const pending = search.isPending || hashtag.isPending;
  const data = (search.data ?? hashtag.data) as
    | {
        query: string;
        videos: VideoHit[];
        related: string[];
        volume: { volumeProxy: string; competitionProxy: string; note: string };
        intent: string;
        warning: string | null;
      }
    | undefined;
  const board = useActionQuery("scout-list", {});
  const seeds = ((board.data as Board | undefined)?.seeds ?? []).slice(0, 5);
  return (
    <ScoutPage
      title="Keyword finder"
      action={
        <Button type="submit" form="keyword-search" disabled={pending || !query.trim()}>
          <PendingIcon pending={pending} />
          Search
        </Button>
      }
    >
      <form
        id="keyword-search"
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const term = query.trim();
          if (!term) return;
          if (term.startsWith("#")) hashtag.mutate({ hashtag: term });
          else search.mutate({ query: term });
        }}
      >
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Keyword or hashtag"
          placeholder="Harley shop Greenville or #bagger"
        />
      </form>
      <ErrorNote error={search.error ?? hashtag.error} />
      {data?.warning ? <p className="text-sm">{data.warning}</p> : null}
      {data ? (
        <div className="grid gap-3">
          <Panel>
            <p className="text-sm">
              {data.intent} · volume proxy {data.volume.volumeProxy} · competition proxy{" "}
              {data.volume.competitionProxy}
            </p>
            <p className="text-xs text-muted-foreground">{data.volume.note}</p>
            {data.related.length > 0 ? (
              <p className="mt-2 text-sm">Related tags: {data.related.join(", ")}</p>
            ) : null}
          </Panel>
          {data.videos.map((video) => (
            <VideoRow key={video.id} video={video} />
          ))}
        </div>
      ) : (
        <details open className="text-sm">
          <summary>Seed library</summary>
          <ul className="mt-2 grid gap-1">
            {seeds.map((seed) => (
              <li key={seed.term}>
                <button type="button" className="underline" onClick={() => setQuery(seed.term)}>
                  {seed.term}
                </button>
                <span className="text-muted-foreground">
                  {" "}
                  · {seed.searchVsTrend} · proxy {seed.volumeProxy}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </ScoutPage>
  );
}

export function CompetitorScreen() {
  const [handle, setHandle] = useState("");
  const fetchOne = useActionMutation("scout-fetch-competitor");
  const data = fetchOne.data as
    | {
        profile: {
          handle: string;
          displayName: string | null;
          followers: number | null;
          likes: number | null;
          videoCount: number | null;
          signature: string | null;
        };
        videos: VideoHit[];
        hooks: string[];
        ctas: string[];
        sounds: string[];
        soundNote: string;
        followerLike: { pct: number | null; belowTarget: boolean };
        warning: string | null;
      }
    | undefined;
  return (
    <ScoutPage
      title="Competitor spy"
      action={
        <Button type="submit" form="competitor-fetch" disabled={fetchOne.isPending || !handle.trim()}>
          <PendingIcon pending={fetchOne.isPending} />
          Fetch
        </Button>
      }
    >
      <form
        id="competitor-fetch"
        onSubmit={(event) => {
          event.preventDefault();
          fetchOne.mutate({ handle });
        }}
      >
        <Input
          value={handle}
          onChange={(event) => setHandle(event.target.value)}
          aria-label="TikTok handle"
          placeholder="@handle"
        />
      </form>
      <ErrorNote error={fetchOne.error} />
      {data ? (
        <div className="grid gap-3">
          {data.warning ? <p className="text-sm">{data.warning}</p> : null}
          <Panel>
            <p className="text-sm font-medium">
              {data.profile.displayName ?? data.profile.handle}
            </p>
            <p className="text-sm text-muted-foreground">
              {formatCount(data.profile.followers)} followers · {formatCount(data.profile.likes)}{" "}
              likes
              {data.followerLike.pct != null
                ? ` · follower÷like ${data.followerLike.pct}%`
                : ""}
              {data.followerLike.belowTarget ? " · under the 15% coaching line" : ""}
            </p>
            {data.profile.signature ? <p className="mt-2 text-sm">{data.profile.signature}</p> : null}
            {data.hooks.length > 0 ? <p className="mt-2 text-sm">Hooks: {data.hooks.join(" · ")}</p> : null}
            {data.ctas.length > 0 ? <p className="text-sm">CTAs: {data.ctas.join(" · ")}</p> : null}
            <p className="mt-2 text-xs text-muted-foreground">
              {data.sounds.length > 0 ? data.sounds.join(", ") : "No sound names in this sample."}{" "}
              {data.soundNote}
            </p>
          </Panel>
          {data.videos.map((video) => (
            <VideoRow key={video.id} video={video} />
          ))}
        </div>
      ) : (
        <SeedAccounts
          label="Watch a seed account. No TikTok login needed."
          pending={fetchOne.isPending}
          onPick={(row) => {
            setHandle(row.handle);
            fetchOne.mutate({
              handle: row.handle,
              role: row.role as "north_star" | "local" | "watch",
              displayName: row.displayName,
            });
          }}
        />
      )}
    </ScoutPage>
  );
}

export function TrendScreen() {
  const discover = useActionMutation("scout-discover-trends");
  const data = discover.data as
    | { terms: TermRow[]; warning: string | null; creditNote: string }
    | undefined;
  return (
    <ScoutPage
      title="Discover trends"
      action={
        <Button
          type="button"
          disabled={discover.isPending}
          onClick={() => discover.mutate({})}
        >
          <PendingIcon pending={discover.isPending} />
          Discover
        </Button>
      }
    >
      <ErrorNote error={discover.error} />
      {data?.warning ? <p className="text-sm">{data.warning}</p> : null}
      {data ? <TermList terms={data.terms} /> : (
        <p className="text-sm text-muted-foreground">
          Two seed searches and one trending feed. Cached hits do not spend a credit.
        </p>
      )}
    </ScoutPage>
  );
}

export function AuditScreen() {
  const [handle, setHandle] = useState("");
  const audit = useActionMutation("scout-audit-page");
  const data = audit.data as
    | {
        id: string;
        summary: {
          handle: string;
          avgViews: number | null;
          topicClusters: { tag: string; count: number }[];
          winners: VideoHit[];
          followerLike: { pct: number | null; belowTarget: boolean };
          ctaQuality: { note: string };
          heatmap: Heatmap;
          limitations: string[];
        };
        warning: string | null;
      }
    | undefined;
  return (
    <ScoutPage
      title="Account audit"
      action={
        <Button type="submit" form="audit-form" disabled={audit.isPending || !handle.trim()}>
          <PendingIcon pending={audit.isPending} />
          Audit
        </Button>
      }
    >
      <form
        id="audit-form"
        onSubmit={(event) => {
          event.preventDefault();
          audit.mutate({ handle });
        }}
      >
        <Input
          value={handle}
          onChange={(event) => setHandle(event.target.value)}
          aria-label="Handle to audit"
          placeholder="@handle"
        />
      </form>
      <ErrorNote error={audit.error} />
      {data ? (
        <div className="grid gap-3">
          {data.warning ? <p className="text-sm">{data.warning}</p> : null}
          <Panel>
            <p className="text-sm">
              @{data.summary.handle} · avg views {formatCount(data.summary.avgViews)}
              {data.summary.followerLike.pct != null
                ? ` · follower÷like ${data.summary.followerLike.pct}%`
                : ""}
            </p>
            <p className="text-sm">{data.summary.ctaQuality.note}</p>
            <p className="text-sm">
              Topics: {data.summary.topicClusters.map((item) => `${item.tag} (${item.count})`).join(", ") || "—"}
            </p>
            {data.summary.limitations.map((line) => (
              <p key={line} className="text-xs text-muted-foreground">
                {line}
              </p>
            ))}
          </Panel>
          <HeatGrid heatmap={data.summary.heatmap} />
          {data.summary.winners.map((video) => (
            <VideoRow key={video.id} video={video} />
          ))}
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              sendToAgentChat({
                openSidebar: true,
                submit: true,
                effort: "high",
                message: `Write the account audit for @${data.summary.handle} from the scout-audit-page metrics already returned (id ${data.id}). ${MODEL_NOTE} Save it with scout-save-audit.`,
              })
            }
          >
            Write the read
          </Button>
        </div>
      ) : (
        <SeedAccounts
          label="Audit a seed account. No TikTok login needed."
          pending={audit.isPending}
          onPick={(row) => {
            setHandle(row.handle);
            audit.mutate({ handle: row.handle });
          }}
        />
      )}
    </ScoutPage>
  );
}

interface Heatmap {
  timezone: string;
  recommended: { dayOfWeek: string; localTime: string; reason: string }[];
  grid: number[][];
  caveat: string;
  firstHourReply: string;
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const BUCKETS = ["12a", "3a", "6a", "9a", "12p", "3p", "6p", "9p"];

export function HeatGrid({ heatmap }: { heatmap: Heatmap }) {
  const max = Math.max(1, ...heatmap.grid.flat());
  return (
    <Panel>
      <div className="grid grid-cols-[3rem_repeat(8,minmax(0,1fr))] gap-1 text-xs">
        <span />
        {BUCKETS.map((bucket) => (
          <span key={bucket} className="text-center text-muted-foreground">
            {bucket}
          </span>
        ))}
        {heatmap.grid.map((row, day) => (
          <div key={DAY_LABELS[day]} className="contents">
            <span className="text-muted-foreground">{DAY_LABELS[day]}</span>
            {row.map((count, index) => (
              <span
                key={`${day}-${index}`}
                className="h-6 rounded-sm bg-primary"
                style={{ opacity: count === 0 ? 0.08 : 0.2 + (count / max) * 0.8 }}
                title={`${DAY_LABELS[day]} ${BUCKETS[index]} · ${count}`}
              />
            ))}
          </div>
        ))}
      </div>
      <ul className="mt-3 grid gap-1 text-sm">
        {heatmap.recommended.map((slot) => (
          <li key={`${slot.dayOfWeek}-${slot.localTime}`}>
            {slot.dayOfWeek} {slot.localTime} ET — {slot.reason}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">{heatmap.caveat}</p>
      <p className="text-sm">{heatmap.firstHourReply}</p>
    </Panel>
  );
}

export function TimingScreen() {
  const query = useActionQuery("scout-best-time", {});
  const heatmap = query.data as Heatmap | undefined;
  return (
    <ScoutPage title="Best time to post">
      {query.isPending ? (
        <div className="h-40 animate-pulse rounded-md bg-muted" />
      ) : heatmap ? (
        <HeatGrid heatmap={heatmap} />
      ) : (
        <ErrorNote error={query.error} />
      )}
    </ScoutPage>
  );
}

export function CreateScreen() {
  const [topic, setTopic] = useState("");
  const [kind, setKind] = useState<"hook" | "script" | "caption">("hook");
  const preview = useActionMutation("scout-draft-copy");
  const data = preview.data as { id: string; body: string; growthPrincipleTags: string[] } | undefined;
  return (
    <ScoutPage
      title="Draft copy"
      action={
        <Button
          type="button"
          disabled={!topic.trim()}
          onClick={() =>
            sendToAgentChat({
              openSidebar: true,
              submit: true,
              effort: "high",
              message: `Draft a ${kind} about “${topic.trim()}” in shop voice. Call scout-draft-copy first, then rewrite and scout-save-draft. ${MODEL_NOTE}`,
            })
          }
        >
          Draft with agent
        </Button>
      }
    >
      <form
        className="grid gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          preview.mutate({ kind, topic });
        }}
      >
        <Select
          label="Draft kind"
          value={kind}
          onChange={setKind}
          options={[
            ["hook", "Hook"],
            ["script", "Script"],
            ["caption", "Caption and hashtags"],
          ] as const}
        />
        <Input
          value={topic}
          onChange={(event) => setTopic(event.target.value)}
          aria-label="Topic"
          placeholder="Twin Cam no-start in Greenville"
        />
        <Button type="submit" variant="outline" disabled={preview.isPending || !topic.trim()}>
          <PendingIcon pending={preview.isPending} />
          Preview pack
        </Button>
      </form>
      <ErrorNote error={preview.error} />
      {data ? (
        <Panel>
          <p className="whitespace-pre-wrap text-sm">{data.body}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            {(data.growthPrincipleTags ?? []).join(" · ")}
          </p>
        </Panel>
      ) : null}
    </ScoutPage>
  );
}

export function RecreateScreen() {
  const board = useActionQuery("scout-list", {});
  const rows = ((board.data as Board | undefined)?.recreates ?? []) as RecreateRow[];
  const send = useActionMutation("scout-send-to-pulse");
  return (
    <ScoutPage title="Paste packs">
      {board.isPending ? (
        <RowsSkeleton />
      ) : rows.length === 0 ? (
        <Panel>
          <p className="text-sm">Recreate a breakout to build a paste pack.</p>
          <Link to="/home" className="text-sm text-primary underline">
            Open Niche pulse
          </Link>
        </Panel>
      ) : (
        <div className="grid gap-3">
          {rows.map((row) => (
            <Panel key={row.id}>
              <p className="text-sm font-medium">{row.card?.title ?? "Paste pack"}</p>
              <p className="text-sm text-muted-foreground">{row.card?.hook}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const pack = row.paste?.markdown;
                    if (!pack) return;
                    void copyText(pack).then(() => toast.success("Copied paste pack"));
                  }}
                >
                  Copy pack
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() =>
                    sendToAgentChat({
                      openSidebar: true,
                      submit: true,
                      effort: "high",
                      message: `Rewrite recreate ${row.id} (“${row.card?.title ?? ""}”) in shop voice. Keep the CapCut and Descript structure. ${MODEL_NOTE} Save with scout-save-recreate.`,
                    })
                  }
                >
                  Rewrite with agent
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={send.isPending}
                  onClick={() =>
                    send.mutate(
                      { id: row.id },
                      {
                        onSuccess: (result) => {
                          const message = (result as { message?: string }).message;
                          if (message) toast.success(message);
                        },
                        onError: (error) => toast.error(actionMessage(error)),
                      },
                    )
                  }
                >
                  Send to Pulse
                </Button>
              </div>
            </Panel>
          ))}
        </div>
      )}
    </ScoutPage>
  );
}

export function StubScreen({ platform }: { platform: string }) {
  return (
    <ScoutPage title={platform}>
      <Panel>
        <p className="text-sm">Coming later — TikTok doesn't need account linking.</p>
      </Panel>
    </ScoutPage>
  );
}

function actionMessage(error: unknown) {
  return actionErrorMessage(error);
}

function FirstRunNote({ pending }: { pending: boolean }) {
  return (
    <Panel>
      <p className="text-sm">
        {pending
          ? "Pulling live search. No TikTok login needed."
          : "No TikTok login needed — click Refresh pulse. Live search uses ScrapeCreators."}
      </p>
    </Panel>
  );
}

function SeedAccounts({
  label,
  pending,
  onPick,
}: {
  label: string;
  pending: boolean;
  onPick: (row: WatchRow) => void;
}) {
  const board = useActionQuery("scout-list", {});
  const rows = ((board.data as Board | undefined)?.watchlist ?? []).slice(0, 6);
  return (
    <Panel>
      <p className="text-sm">{label}</p>
      {board.isPending ? (
        <div className="mt-3 h-8 animate-pulse rounded-md bg-muted" />
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          {rows.map((row) => (
            <Button
              key={row.handle}
              type="button"
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => onPick(row)}
            >
              {row.displayName}
            </Button>
          ))}
        </div>
      )}
    </Panel>
  );
}

function noticeText(board: Board | undefined, report: unknown) {
  const saved = board?.missedWarning;
  if (saved) return saved;
  const warning = (report as { warning?: string | null } | undefined)?.warning;
  return warning || null;
}

function readPulseSeedAt(): number | null {
  try {
    const raw = localStorage.getItem(PULSE_SEED_STORAGE_KEY);
    if (!raw) return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

function writePulseSeedAt(now: number) {
  try {
    localStorage.setItem(PULSE_SEED_STORAGE_KEY, String(now));
  } catch {
    // Private mode can block storage. The in-memory ref still stops a double fire.
  }
}
