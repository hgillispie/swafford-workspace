import { sendToAgentChat } from "@agent-native/core/client/agent-chat";
import {
  actionErrorMessage,
  callAction,
  useActionMutation,
  useActionQuery,
} from "@agent-native/core/client/hooks";
import { IconArrowLeft } from "@tabler/icons-react";
import { useState } from "react";
import { Link, useParams } from "react-router";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { APP_TITLE } from "@/lib/app-config";

export function meta() {
  return [{ title: `Project · ${APP_TITLE}` }];
}

function clock(ms: number) {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export default function ProjectRoute() {
  const { id = "" } = useParams();
  const sync = useActionQuery(
    "sync-opus-project",
    { id },
    { enabled: Boolean(id), refetchInterval: 4000 },
  );
  const score = useActionMutation("score-moments-locally");
  const render = useActionMutation("render-opus-clip");
  const captions = useActionMutation("set-opus-captions");
  const [error, setError] = useState("");
  const [rendering, setRendering] = useState("");

  if (sync.isPending || !sync.data) {
    return (
      <div className="mx-auto grid w-full max-w-[1450px] gap-6 px-5 py-8 lg:grid-cols-2 lg:px-12">
        <Skeleton className="aspect-video w-full" />
        <div className="space-y-3">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    );
  }

  if (sync.isError) {
    return (
      <div className="p-10 text-sm">
        <p>This project is not available.</p>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/">
            <IconArrowLeft size={15} aria-hidden />
            Back
          </Link>
        </Button>
      </div>
    );
  }

  const { project, words, clips, jobs } = sync.data;
  const active = jobs.find(
    (job) => job.status === "running" || job.status === "queued",
  );

  return (
    <div className="studio-page mx-auto grid w-full max-w-[1450px] gap-8 px-5 py-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:px-12">
      <section>
        <Link
          to="/"
          className="mb-4 inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground"
        >
          <IconArrowLeft size={14} aria-hidden />
          Studio
        </Link>
        <h1 className="text-3xl font-semibold tracking-[-0.05em]">{project.title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {project.transcriptStatus}
          {project.durationMs ? ` · ${clock(project.durationMs)}` : ""}
          {active
            ? ` · ${active.progressLabel || active.kind} ${active.progress}%`
            : ""}
        </p>
        <div className="mt-5 overflow-hidden rounded-md bg-black">
          {project.mediaUrl ? (
            <video
              key={project.mediaUrl}
              src={project.mediaUrl}
              controls
              className="aspect-video w-full"
            />
          ) : (
            <div className="flex aspect-video items-center justify-center text-sm text-white/70">
              {project.hasSource
                ? "Proxy is encoding."
                : "Waiting for the source file."}
            </div>
          )}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <label className="text-xs text-muted-foreground">
            Captions
            <select
              className="ml-2 h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground"
              value={project.captionStyle}
              onChange={(event) =>
                void captions.mutateAsync({
                  id,
                  captionStyle: event.target.value as
                    | "karaoke"
                    | "bold"
                    | "minimal"
                    | "phrase",
                  captionFont: project.captionFont as
                    | "dejavu"
                    | "liberation"
                    | "noto",
                })
              }
            >
              <option value="karaoke">Karaoke</option>
              <option value="bold">Bold</option>
              <option value="minimal">Minimal</option>
              <option value="phrase">Phrase</option>
            </select>
          </label>
          <label className="text-xs text-muted-foreground">
            Font
            <select
              className="ml-2 h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground"
              value={project.captionFont}
              onChange={(event) =>
                void captions.mutateAsync({
                  id,
                  captionStyle: project.captionStyle as
                    | "karaoke"
                    | "bold"
                    | "minimal"
                    | "phrase",
                  captionFont: event.target.value as
                    | "dejavu"
                    | "liberation"
                    | "noto",
                })
              }
            >
              <option value="dejavu">DejaVu</option>
              <option value="liberation">Liberation</option>
              <option value="noto">Noto</option>
            </select>
          </label>
        </div>
        {project.transcriptError ? (
          <p className="mt-3 text-sm text-destructive">{project.transcriptError}</p>
        ) : null}
        {error ? (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </section>
      <section className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            disabled={words.length === 0}
            onClick={() =>
              sendToAgentChat({
                message:
                  "Read this transcript with sync-opus-project and save 3 to 5 scored moments with save-opus-moments. Give each a title, score, reason, and hook, engagement, value, and shareability.",
                context: `Opus project id: ${id}`,
                openSidebar: true,
                submit: true,
              })
            }
          >
            Find moments
          </Button>
          <Button
            variant="outline"
            disabled={words.length === 0 || score.isPending}
            onClick={() => {
              setError("");
              void score.mutateAsync({ id }).catch((caught) => {
                setError(actionErrorMessage(caught) ?? "Local score failed.");
              });
            }}
          >
            Score locally
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Find moments asks the agent. Score locally is a deterministic fallback
          and labels every clip Local score.
        </p>
        <ul className="mt-5 space-y-3">
          {clips.map((clip) => (
            <li key={clip.id} className="rounded-md border border-border p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{clip.title}</p>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">
                    {clock(clip.startMs)}–{clock(clip.endMs)} · {clip.score}
                    {clip.source === "local" ? " · Local score" : " · Agent"}
                  </p>
                </div>
                <Button
                  size="sm"
                  disabled={rendering === clip.id || clip.status === "rendering"}
                  onClick={() => {
                    setRendering(clip.id);
                    setError("");
                    void render
                      .mutateAsync({ id, clipId: clip.id })
                      .catch((caught) => {
                        setError(actionErrorMessage(caught) ?? "Render failed.");
                      })
                      .finally(() => setRendering(""));
                  }}
                >
                  {clip.status === "ready" ? "Render again" : "Render 9:16"}
                </Button>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{clip.reason}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                Hook {clip.hook} · Engagement {clip.engagement} · Value {clip.value} ·
                Share {clip.shareability}
                {clip.status !== "draft" ? ` · ${clip.status}` : ""}
              </p>
              {clip.error ? (
                <p className="mt-2 text-sm text-destructive">{clip.error}</p>
              ) : null}
              {clip.downloadable ? (
                <button
                  type="button"
                  className="mt-3 text-sm font-medium underline-offset-2 hover:underline"
                  onClick={() => {
                    void callAction(
                      "open-opus-clip",
                      { id, clipId: clip.id },
                      { method: "GET" },
                    ).then((signed) => {
                      window.open(signed.url, "_blank", "noopener,noreferrer");
                    });
                  }}
                >
                  Download MP4
                </button>
              ) : null}
            </li>
          ))}
          {clips.length === 0 ? (
            <li className="text-sm text-muted-foreground">
              {words.length
                ? "No moments saved yet."
                : "The transcript arrives after the worker finishes audio and speech recognition."}
            </li>
          ) : null}
        </ul>
        {words.length > 0 ? (
          <p className="mt-6 max-h-48 overflow-auto text-sm leading-6 text-foreground/80">
            {words.map((word) => word.text).join(" ")}
          </p>
        ) : null}
      </section>
    </div>
  );
}
