import { sendToAgentChat } from "@agent-native/core/client/agent-chat";
import {
  actionErrorMessage,
  useActionMutation,
  useActionQuery,
} from "@agent-native/core/client/hooks";
import { IconArrowRight, IconUpload } from "@tabler/icons-react";
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { APP_TITLE } from "@/lib/app-config";
import { uploadVideoFile } from "@/lib/upload";

export function meta() {
  return [{ title: `Studio · ${APP_TITLE}` }];
}

function formatBytes(bytes: number) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export default function HomeRoute() {
  const navigate = useNavigate();
  const library = useActionQuery("list-library-videos", {});
  const projects = useActionQuery("list-opus-projects", {});
  const createFromLibrary = useActionMutation("create-opus-from-library");
  const ingest = useActionMutation("ingest-youtube");
  const [youtube, setYoutube] = useState("");
  const [error, setError] = useState("");
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [busyId, setBusyId] = useState("");

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError("");
    setUploadProgress(0);
    try {
      const created = await uploadVideoFile(file, setUploadProgress);
      navigate(`/projects/${created.id}`);
    } catch (caught) {
      setError(actionErrorMessage(caught) ?? "Upload failed.");
      setUploadProgress(null);
    }
  }

  async function onYoutube(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const created = await ingest.mutateAsync({
        url: youtube.trim(),
      });
      navigate(`/projects/${created.id}`);
    } catch (caught) {
      setError(actionErrorMessage(caught) ?? "Could not queue that URL.");
    }
  }

  return (
    <div className="studio-page mx-auto w-full max-w-[1450px] px-5 pb-20 pt-10 sm:px-8 lg:px-12 lg:pt-14">
      <div className="mb-8 flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.19em] text-muted-foreground">
        <span className="size-1.5 rounded-full bg-primary" />
        Source
      </div>
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.8fr)]">
        <section>
          <h1 className="max-w-xl text-[clamp(2.6rem,5vw,4.6rem)] font-semibold leading-[0.98] tracking-[-0.07em]">
            Long takes.
            <br />
            <span className="text-primary">Short cuts.</span>
          </h1>
          <p className="mt-5 max-w-md text-sm text-muted-foreground">
            Pick footage already in the dumps bucket, or upload a new file.
            Opus transcribes it, scores moments, and renders vertical clips.
          </p>
          <label className="studio-input mt-8 flex h-28 cursor-pointer flex-col items-center justify-center gap-2 border border-dashed text-sm">
            <IconUpload size={18} aria-hidden />
            <span>
              {uploadProgress === null
                ? "Upload a video"
                : `Uploading ${Math.round(uploadProgress * 100)}%`}
            </span>
            <input
              type="file"
              accept="video/*,.mp4,.mov,.mkv"
              className="sr-only"
              disabled={uploadProgress !== null}
              onChange={(event) => void onFile(event.target.files?.[0])}
            />
          </label>
          {error ? (
            <p role="alert" className="mt-3 text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <form onSubmit={onYoutube} className="mt-8 max-w-xl space-y-3">
            <Label htmlFor="youtube" className="text-xs font-semibold">
              YouTube URL, optional
            </Label>
            <div className="flex gap-2">
              <Input
                id="youtube"
                value={youtube}
                onChange={(event) => setYoutube(event.target.value)}
                placeholder="https://youtube.com/watch?v=…"
                className="studio-input h-11"
              />
              <Button type="submit" disabled={!youtube.trim() || ingest.isPending}>
                Queue
              </Button>
            </div>
          </form>
        </section>
        <section className="space-y-8">
          <div>
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Library
            </h2>
            {library.isPending ? (
              <div className="mt-3 space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : (
              <ul className="mt-3 divide-y divide-border border-y border-border">
                {(library.data?.videos ?? []).slice(0, 8).map((video) => (
                  <li key={video.id} className="flex items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{video.filename}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatBytes(video.sizeBytes)}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busyId === video.id}
                      onClick={() => {
                        setBusyId(video.id);
                        void createFromLibrary
                          .mutateAsync({ dumpFileId: video.id })
                          .then((created) => navigate(`/projects/${created.id}`))
                          .catch((caught) => {
                            setError(
                              actionErrorMessage(caught) ?? "Could not open that file.",
                            );
                            setBusyId("");
                          });
                      }}
                    >
                      Use
                      <IconArrowRight size={14} aria-hidden />
                    </Button>
                  </li>
                ))}
                {(library.data?.videos ?? []).length === 0 ? (
                  <li className="py-4 text-sm text-muted-foreground">
                    No ready videos in the dumps bucket yet.
                  </li>
                ) : null}
              </ul>
            )}
          </div>
          <div id="projects">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Projects
            </h2>
            {projects.isPending ? (
              <Skeleton className="mt-3 h-16 w-full" />
            ) : (
              <ul className="mt-3 space-y-2">
                {(projects.data?.projects ?? []).map((project) => (
                  <li key={project.id}>
                    <Link
                      to={`/projects/${project.id}`}
                      className="flex items-center justify-between rounded-md border border-border px-3 py-3 text-sm hover:bg-accent"
                    >
                      <span className="truncate font-medium">{project.title}</span>
                      <span className="text-xs text-muted-foreground">
                        {project.transcriptStatus}
                      </span>
                    </Link>
                  </li>
                ))}
                {(projects.data?.projects ?? []).length === 0 ? (
                  <li className="text-sm text-muted-foreground">No projects yet.</li>
                ) : null}
              </ul>
            )}
            <Button
              variant="ghost"
              className="mt-3 px-0"
              onClick={() =>
                sendToAgentChat({
                  message:
                    "Look at my latest Opus project and tell me which moments are worth clipping.",
                  openSidebar: true,
                  submit: true,
                })
              }
            >
              Ask the agent
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}
