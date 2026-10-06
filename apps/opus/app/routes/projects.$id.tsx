import { sendToAgentChat } from "@agent-native/core/client/agent-chat";
import { isStartingRenderer } from "@swafford-workspace/media-core";
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

type Aspect = "9:16" | "1:1" | "16:9";
type CaptionStyle = "karaoke" | "bold" | "minimal" | "phrase";
type CaptionFont = "dejavu" | "liberation" | "noto";
type CaptionPosition = "bottom" | "middle" | "top";

function clock(ms: number) {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function seconds(ms: number) {
  return (Math.max(0, ms) / 1000).toFixed(1);
}

function scorerLabel(source: string) {
  return source === "local" ? "Local score" : "Agent";
}

const fieldClass =
  "h-8 rounded-md border border-border bg-background px-2 text-sm text-foreground";

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
  const [busy, setBusy] = useState("");

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
  const readyCount = clips.filter((clip) => clip.downloadable).length;

  function saveDefaults(patch: {
    captionStyle?: CaptionStyle;
    captionFont?: CaptionFont;
    captionPosition?: CaptionPosition;
    aspect?: Aspect;
    hookOverlay?: boolean;
  }) {
    void captions
      .mutateAsync({
        id,
        captionStyle: patch.captionStyle ?? (project.captionStyle as CaptionStyle),
        captionFont: patch.captionFont ?? (project.captionFont as CaptionFont),
        captionPosition:
          patch.captionPosition ?? (project.captionPosition as CaptionPosition),
        aspect: patch.aspect ?? (project.aspect as Aspect),
        hookOverlay: patch.hookOverlay ?? project.hookOverlay,
      })
      .catch((caught) => {
        setError(actionErrorMessage(caught) ?? "Could not save defaults.");
      });
  }

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
          {project.transcriptSource ? ` · ${project.transcriptSource}` : ""}
          {project.durationMs ? ` · ${clock(project.durationMs)}` : ""}
          {active
            ? isStartingRenderer(active)
              ? " · Starting renderer…"
              : ` · ${active.progressLabel || active.kind} ${active.progress}%`
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
                ? active && isStartingRenderer(active)
                  ? "Starting renderer…"
                  : "Proxy is encoding."
                : "Waiting for the source file."}
            </div>
          )}
        </div>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="text-xs text-muted-foreground">
            Aspect
            <select
              className={`ml-2 ${fieldClass}`}
              value={project.aspect}
              onChange={(event) =>
                saveDefaults({ aspect: event.target.value as Aspect })
              }
            >
              <option value="9:16">9:16</option>
              <option value="1:1">1:1</option>
              <option value="16:9">16:9</option>
            </select>
          </label>
          <label className="text-xs text-muted-foreground">
            Captions
            <select
              className={`ml-2 ${fieldClass}`}
              value={project.captionStyle}
              onChange={(event) =>
                saveDefaults({ captionStyle: event.target.value as CaptionStyle })
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
              className={`ml-2 ${fieldClass}`}
              value={project.captionFont}
              onChange={(event) =>
                saveDefaults({ captionFont: event.target.value as CaptionFont })
              }
            >
              <option value="dejavu">DejaVu</option>
              <option value="liberation">Liberation</option>
              <option value="noto">Noto</option>
            </select>
          </label>
          <label className="text-xs text-muted-foreground">
            Position
            <select
              className={`ml-2 ${fieldClass}`}
              value={project.captionPosition}
              onChange={(event) =>
                saveDefaults({
                  captionPosition: event.target.value as CaptionPosition,
                })
              }
            >
              <option value="bottom">Bottom</option>
              <option value="middle">Middle</option>
              <option value="top">Top</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={project.hookOverlay}
              onChange={(event) =>
                saveDefaults({ hookOverlay: event.target.checked })
              }
            />
            Hook title for 3s
          </label>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Defaults apply to clips saved after this change.
        </p>
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
                  "Find the strongest moments in this transcript and save them.",
                context: `Opus project id: ${id}. Page list-moment-chunks until every chunk is read, rank one global shortlist, then call save-opus-moments once. The server snaps each range to sentence boundaries.`,
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
          <Button
            variant="outline"
            disabled={clips.length === 0 || render.isPending}
            onClick={() => {
              setError("");
              setBusy("all");
              void render
                .mutateAsync({ id })
                .catch((caught) => {
                  setError(actionErrorMessage(caught) ?? "Render failed.");
                })
                .finally(() => setBusy(""));
            }}
          >
            Render all
          </Button>
          <Button
            variant="outline"
            disabled={readyCount === 0}
            onClick={() => {
              setError("");
              void callAction("open-opus-clips", { id }, { method: "GET" })
                .then(async (signed) => {
                  for (const clip of signed.clips) {
                    const anchor = document.createElement("a");
                    anchor.href = clip.url;
                    anchor.download = `${clip.title}.mp4`;
                    anchor.rel = "noopener";
                    document.body.appendChild(anchor);
                    anchor.click();
                    anchor.remove();
                    await new Promise((resolve) => setTimeout(resolve, 350));
                  }
                })
                .catch((caught) => {
                  setError(actionErrorMessage(caught) ?? "Download failed.");
                });
            }}
          >
            Download all
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Find moments asks the agent and labels those clips Agent. Score locally
          is the fallback and labels every clip Local score. Render all uses one
          worker job for this source.
        </p>
        <ul className="mt-5 space-y-3">
          {clips.map((clip) => {
            const rendering =
              clip.status === "queued" || clip.status === "rendering";
            const starting =
              clip.jobStatus === "queued" &&
              isStartingRenderer({
                status: clip.jobStatus,
                progressLabel: clip.progressLabel,
              });
            return (
              <li key={clip.id} className="rounded-md border border-border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{clip.title}</p>
                    <p className="mt-1 font-mono text-xs text-muted-foreground">
                      {clock(clip.startMs)}–{clock(clip.endMs)} · virality{" "}
                      {clip.score} · {scorerLabel(clip.source)}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    disabled={busy === clip.id || rendering}
                    onClick={() => {
                      setBusy(clip.id);
                      setError("");
                      void render
                        .mutateAsync({ id, clipId: clip.id })
                        .catch((caught) => {
                          setError(actionErrorMessage(caught) ?? "Render failed.");
                        })
                        .finally(() => setBusy(""));
                    }}
                  >
                    {clip.status === "ready" ? "Regenerate" : "Render"}
                  </Button>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{clip.reason}</p>
                {rendering ? (
                  <div className="mt-3">
                    <p className="text-xs text-muted-foreground">
                      {starting
                        ? "Starting renderer…"
                        : clip.progressLabel || clip.status}{" "}
                      {starting ? "" : `${clip.progress}%`}
                    </p>
                    <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full bg-primary"
                        style={{ width: `${starting ? 8 : clip.progress}%` }}
                      />
                    </div>
                  </div>
                ) : (
                  <p className="mt-2 text-xs uppercase tracking-[0.12em] text-muted-foreground">
                    {clip.status}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap items-end gap-2">
                  <label className="text-xs text-muted-foreground">
                    Start
                    <input
                      className={`ml-2 w-20 ${fieldClass}`}
                      defaultValue={seconds(clip.startMs)}
                      key={`${clip.id}-start-${clip.startMs}`}
                      inputMode="decimal"
                      aria-label="Clip start seconds"
                      onBlur={(event) => {
                        const next = Math.round(Number(event.target.value) * 1000);
                        if (!Number.isFinite(next) || next === clip.startMs) return;
                        setError("");
                        void callAction("update-opus-clip", {
                          id,
                          clipId: clip.id,
                          startMs: next,
                        }).catch((caught) => {
                          setError(actionErrorMessage(caught) ?? "Trim failed.");
                        });
                      }}
                    />
                  </label>
                  <label className="text-xs text-muted-foreground">
                    End
                    <input
                      className={`ml-2 w-20 ${fieldClass}`}
                      defaultValue={seconds(clip.endMs)}
                      key={`${clip.id}-end-${clip.endMs}`}
                      inputMode="decimal"
                      aria-label="Clip end seconds"
                      onBlur={(event) => {
                        const next = Math.round(Number(event.target.value) * 1000);
                        if (!Number.isFinite(next) || next === clip.endMs) return;
                        setError("");
                        void callAction("update-opus-clip", {
                          id,
                          clipId: clip.id,
                          endMs: next,
                        }).catch((caught) => {
                          setError(actionErrorMessage(caught) ?? "Trim failed.");
                        });
                      }}
                    />
                  </label>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      void callAction("update-opus-clip", {
                        id,
                        clipId: clip.id,
                        nudgeStartMs: -1000,
                      }).catch((caught) =>
                        setError(actionErrorMessage(caught) ?? "Trim failed."),
                      )
                    }
                  >
                    Start −1s
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      void callAction("update-opus-clip", {
                        id,
                        clipId: clip.id,
                        nudgeStartMs: 1000,
                      }).catch((caught) =>
                        setError(actionErrorMessage(caught) ?? "Trim failed."),
                      )
                    }
                  >
                    Start +1s
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      void callAction("update-opus-clip", {
                        id,
                        clipId: clip.id,
                        nudgeEndMs: -1000,
                      }).catch((caught) =>
                        setError(actionErrorMessage(caught) ?? "Trim failed."),
                      )
                    }
                  >
                    End −1s
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      void callAction("update-opus-clip", {
                        id,
                        clipId: clip.id,
                        nudgeEndMs: 1000,
                      }).catch((caught) =>
                        setError(actionErrorMessage(caught) ?? "Trim failed."),
                      )
                    }
                  >
                    End +1s
                  </Button>
                </div>
                <div className="mt-3 flex flex-wrap items-end gap-2">
                  <label className="text-xs text-muted-foreground">
                    Aspect
                    <select
                      className={`ml-2 ${fieldClass}`}
                      value={clip.aspect}
                      onChange={(event) =>
                        void callAction("update-opus-clip", {
                          id,
                          clipId: clip.id,
                          aspect: event.target.value as Aspect,
                        })
                      }
                    >
                      <option value="9:16">9:16</option>
                      <option value="1:1">1:1</option>
                      <option value="16:9">16:9</option>
                    </select>
                  </label>
                  <label className="text-xs text-muted-foreground">
                    Style
                    <select
                      className={`ml-2 ${fieldClass}`}
                      value={clip.captionStyle}
                      onChange={(event) =>
                        void callAction("update-opus-clip", {
                          id,
                          clipId: clip.id,
                          captionStyle: event.target.value as CaptionStyle,
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
                      className={`ml-2 ${fieldClass}`}
                      value={clip.captionFont}
                      onChange={(event) =>
                        void callAction("update-opus-clip", {
                          id,
                          clipId: clip.id,
                          captionFont: event.target.value as CaptionFont,
                        })
                      }
                    >
                      <option value="dejavu">DejaVu</option>
                      <option value="liberation">Liberation</option>
                      <option value="noto">Noto</option>
                    </select>
                  </label>
                  <label className="text-xs text-muted-foreground">
                    Position
                    <select
                      className={`ml-2 ${fieldClass}`}
                      value={clip.captionPosition}
                      onChange={(event) =>
                        void callAction("update-opus-clip", {
                          id,
                          clipId: clip.id,
                          captionPosition: event.target.value as CaptionPosition,
                        })
                      }
                    >
                      <option value="bottom">Bottom</option>
                      <option value="middle">Middle</option>
                      <option value="top">Top</option>
                    </select>
                  </label>
                  <label className="flex items-center gap-2 pb-1 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={clip.hookOverlay}
                      onChange={(event) =>
                        void callAction("update-opus-clip", {
                          id,
                          clipId: clip.id,
                          hookOverlay: event.target.checked,
                        })
                      }
                    />
                    Hook overlay
                  </label>
                </div>
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
            );
          })}
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
