import { sendToAgentChat, setAgentChatContextItem } from "@agent-native/core/client/agent-chat";
import { callAction, useActionQuery } from "@agent-native/core/client/hooks";
import {
  deleteClientAppState,
  writeClientAppState,
} from "@agent-native/core/client/application-state";
import {
  buildComposition,
  countFillers,
  DEFAULT_FILLERS,
  DEFAULT_MAX_GAP_MS,
  findFillers,
  OPTIONAL_FILLERS,
  planShortenGaps,
  trailingGapMs,
} from "@shared/transcript";
import {
  IconArrowBackUp,
  IconArrowForwardUp,
  IconArrowLeft,
} from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router";

import {
  CleanupMenu,
  ViewMenu,
  type CleanupMode,
} from "@/components/editor/EditorMenus";
import { EditorTopBar } from "@/components/editor/EditorTopBar";
import { MediaPreview } from "@/components/editor/MediaPreview";
import { usePlaybackController } from "@/components/editor/playback";
import {
  FailedState,
  NeedsMediaState,
  NeedsTranscriptState,
  ScriptSkeleton,
  TranscribingState,
  UploadingState,
} from "@/components/editor/ScriptStates";
import {
  ScriptView,
  type ScriptSelection,
} from "@/components/editor/ScriptView";
import {
  CorrectWordPopover,
  SelectionToolbar,
} from "@/components/editor/SelectionToolbar";
import { Timeline } from "@/components/editor/Timeline";
import { useProjectEditor } from "@/components/editor/use-project-editor";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useMediaImport } from "@/hooks/use-media-import";
import { APP_TITLE } from "@/lib/app-config";
import {
  hasPendingFile,
  retryImport,
  transcribeProject,
  useImportState,
} from "@/lib/import-store";
import { localMediaUrl } from "@/lib/media";
import { TAB_ID } from "@/lib/tab-id";

export function meta() {
  return [{ title: `Editor · ${APP_TITLE}` }];
}

function isTypingTarget(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el) return false;
  if (el.isContentEditable) return true;
  return (
    ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) ||
    !!el.closest("[role='dialog'],[role='menu']")
  );
}

const STALE_PROCESSING_MS = 5 * 60 * 1000;

const IS_MAC =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad/.test(navigator.platform);

export default function EditorRoute() {
  const { projectId = "" } = useParams();
  const queryClient = useQueryClient();
  const editor = useProjectEditor(projectId);
  const sync = useActionQuery(
    "sync-project",
    { id: projectId },
    {
      enabled: Boolean(projectId),
      refetchInterval: 4000,
    },
  );
  useEffect(() => {
    if (!sync.data) return;
    void queryClient.invalidateQueries({
      queryKey: ["action", "get-project", { id: projectId }],
    });
  }, [projectId, queryClient, sync.dataUpdatedAt]);
  const controller = usePlaybackController();
  const importState = useImportState(projectId);
  const { attachFile } = useMediaImport();
  const scrollRef = useRef<HTMLDivElement>(null);

  const [selection, setSelection] = useState<ScriptSelection | null>(null);
  const [showCuts, setShowCuts] = useState(true);
  const [captions, setCaptions] = useState(true);
  const [cleanupMode, setCleanupMode] = useState<CleanupMode>(null);
  const [includeExtended, setIncludeExtended] = useState(false);
  const [maxGapMs, setMaxGapMs] = useState(DEFAULT_MAX_GAP_MS);
  const [correcting, setCorrecting] = useState<{
    position: number;
    text: string;
    anchor: { top: number; left: number; width: number };
  } | null>(null);

  const { project, words, speakers, canEdit } = editor;
  const lastWord = words[words.length - 1];
  const mediaDurationMs = Math.max(
    project?.durationMs ?? 0,
    lastWord?.endMs ?? 0,
  );
  const composition = useMemo(
    () => buildComposition(words, mediaDurationMs),
    [words, mediaDurationMs],
  );

  useEffect(() => {
    controller.setComposition(composition);
  }, [controller, composition]);

  const fillerMatches = useMemo(
    () =>
      findFillers(
        words,
        includeExtended
          ? [...DEFAULT_FILLERS, ...OPTIONAL_FILLERS]
          : DEFAULT_FILLERS,
      ),
    [words, includeExtended],
  );
  const fillerCounts = useMemo(
    () => countFillers(fillerMatches),
    [fillerMatches],
  );
  const fillerPositions = useMemo(
    () => new Set(fillerMatches.flatMap((m) => m.positions)),
    [fillerMatches],
  );
  const gapStats = useMemo(
    () =>
      cleanupMode === "gaps"
        ? planShortenGaps(words, mediaDurationMs, maxGapMs)
        : { shortened: 0, savedMs: 0 },
    [cleanupMode, words, mediaDurationMs, maxGapMs],
  );
  const gapCandidates = useMemo(() => {
    const set = new Set<number>();
    if (cleanupMode !== "gaps") return set;
    words.forEach((word, i) => {
      if (!word.deleted && trailingGapMs(words, i, mediaDurationMs) > maxGapMs)
        set.add(word.position);
    });
    return set;
  }, [cleanupMode, words, mediaDurationMs, maxGapMs]);
  const hasTrims = useMemo(() => words.some((w) => w.gapTrimMs > 0), [words]);

  const selectedWords = useMemo(() => {
    if (!selection) return [];
    return words.filter(
      (w) =>
        w.position >= selection.from &&
        w.position <= selection.to &&
        (showCuts || !w.deleted),
    );
  }, [selection, words, showCuts]);
  const selectionText = selectedWords.map((w) => w.text).join(" ");

  useEffect(() => {
    if (!selection || selectedWords.length === 0) {
      void deleteClientAppState("selection", { requestSource: TAB_ID }).catch(
        () => undefined,
      );
      return;
    }
    const timer = window.setTimeout(() => {
      void writeClientAppState(
        "selection",
        {
          kind: "transcript",
          projectId,
          from: selection.from,
          to: selection.to,
          text: selectionText.slice(0, 400),
          capturedAt: new Date().toISOString(),
        },
        { requestSource: TAB_ID },
      ).catch(() => undefined);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [selection, selectedWords.length, selectionText, projectId]);

  useEffect(
    () => () => {
      void deleteClientAppState("selection", {
        requestSource: TAB_ID,
        keepalive: true,
      }).catch(() => undefined);
    },
    [],
  );

  const clearSelection = useCallback(() => {
    document.getSelection()?.removeAllRanges();
    setSelection(null);
  }, []);

  const cutSelection = useCallback(() => {
    if (!selection || !canEdit) return;
    void editor.setDeleted([{ from: selection.from, to: selection.to }], true);
    clearSelection();
  }, [selection, canEdit, editor, clearSelection]);

  const restoreSelection = useCallback(() => {
    if (!selection || !canEdit) return;
    void editor.setDeleted([{ from: selection.from, to: selection.to }], false);
    clearSelection();
  }, [selection, canEdit, editor, clearSelection]);

  const askAgent = useCallback(() => {
    if (!selection || !project) return;
    const excerpt =
      selectionText.length > 60
        ? `${selectionText.slice(0, 57)}…`
        : selectionText;
    setAgentChatContextItem({
      key: "cutline-selection",
      title: `“${excerpt}”`,
      context: `Cutline project "${project.title}" (projectId ${project.id}). The user selected transcript words ${selection.from}-${selection.to} (inclusive word positions): "${selectionText.slice(0, 1500)}"`,
      openSidebar: true,
      focus: true,
    });
  }, [selection, project, selectionText]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      const mod = IS_MAC ? event.metaKey : event.ctrlKey;
      if (mod && event.key.toLowerCase() === "z") {
        if (!canEdit) return;
        event.preventDefault();
        if (event.shiftKey) editor.redo();
        else editor.undo();
        return;
      }
      if (mod && event.key.toLowerCase() === "y" && !IS_MAC) {
        event.preventDefault();
        editor.redo();
        return;
      }
      if (event.key === " " && !mod) {
        const el = event.target as HTMLElement | null;
        if (
          el?.closest(
            "button, a, [role='button'], [role='slider'], [role='menuitem']",
          )
        )
          return;
        event.preventDefault();
        controller.toggle();
        return;
      }
      if ((event.key === "Backspace" || event.key === "Delete") && selection) {
        event.preventDefault();
        cutSelection();
        return;
      }
      if (event.key === "Escape" && selection) {
        clearSelection();
        return;
      }
      if (
        !selection &&
        (event.key === "ArrowLeft" || event.key === "ArrowRight")
      ) {
        event.preventDefault();
        controller.skip(event.key === "ArrowLeft" ? -5000 : 5000);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canEdit, editor, controller, selection, cutSelection, clearSelection]);

  const startCorrect = useCallback(() => {
    if (!selection || selection.from !== selection.to) return;
    const word = words.find((w) => w.position === selection.from);
    if (!word) return;
    setCorrecting({
      position: word.position,
      text: word.text,
      anchor: {
        top: selection.top + 28,
        left: selection.left,
        width: Math.max(selection.width, 24),
      },
    });
    clearSelection();
  }, [selection, words, clearSelection]);

  if (editor.query.isError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-[15px] font-semibold">
          This project isn't available
        </p>
        <p className="text-[13px] text-muted-foreground">
          It may have been deleted, or it hasn't been shared with you.
        </p>
        <Button asChild variant="outline" size="sm" className="mt-2">
          <Link to="/">
            <IconArrowLeft size={15} aria-hidden />
            Back to projects
          </Link>
        </Button>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex h-12 items-center gap-3 border-b border-border bg-card px-3">
          <Skeleton className="size-8" />
          <Skeleton className="h-4 w-48" />
        </div>
        <div className="flex min-h-0 flex-1">
          <div className="mx-auto w-full max-w-[44rem] px-10 py-10">
            <ScriptSkeleton />
          </div>
          <div className="hidden w-[min(42%,520px)] border-l border-border p-6 lg:block">
            <Skeleton className="aspect-video w-full rounded-lg" />
          </div>
        </div>
      </div>
    );
  }

  const mediaSrc = project.mediaUrl ?? localMediaUrl(project.id);
  const hasTranscript = words.length > 0;
  const staleProcessing =
    project.transcriptStatus === "processing" &&
    !importState &&
    Date.now() - Date.parse(project.updatedAt) > STALE_PROCESSING_MS;
  const jobProgress = (sync.data?.jobs ?? []).find(
    (job) => job.status === "running" || job.status === "queued",
  );
  const transcribing =
    importState?.phase === "transcribing" ||
    (project.transcriptStatus === "processing" && !staleProcessing);
  const failure =
    importState?.phase === "failed"
      ? {
          message: importState.error ?? "Something went wrong.",
          code: importState.errorCode,
        }
      : !hasTranscript && project.transcriptStatus === "failed"
        ? {
            message: project.transcriptError ?? "Transcription failed.",
            code: "transcription" as const,
          }
        : !hasTranscript && staleProcessing
          ? {
              message:
                "Transcription stopped before it finished, probably because the tab was closed.",
              code: "transcription" as const,
            }
          : null;
  const needsConnection =
    failure?.code === "storage_unavailable" ||
    /connect builder/i.test(failure?.message ?? "");
  const uploadFailed = !!failure && failure.code !== "transcription";
  const canRetry = uploadFailed
    ? hasPendingFile(project.id)
    : !!project.mediaUrl;
  const retry = () => {
    if (uploadFailed) retryImport(project.id, queryClient);
    else void transcribeProject(project.id, queryClient);
  };
  const previewNote =
    !mediaSrc && hasTranscript
      ? project.isSample
        ? "Sample project · preview plays the transcript timing without media"
        : "No media attached · preview follows the transcript timing"
      : null;

  let body: React.ReactNode;
  if (importState?.phase === "uploading") {
    body = <UploadingState progress={importState.progress} />;
  } else if (transcribing && !hasTranscript) {
    body = (
      <TranscribingState
        progress={
          importState?.phase === "transcribing"
            ? importState.progress
            : jobProgress
              ? jobProgress.progress / 100
              : null
        }
        durationMs={project.durationMs}
      />
    );
  } else if (failure && !hasTranscript) {
    body = (
      <FailedState
        message={failure.message}
        needsConnection={needsConnection}
        canRetry={canRetry && canEdit}
        onRetry={retry}
      />
    );
  } else if (!hasTranscript && project.mediaUrl) {
    body = (
      <NeedsTranscriptState
        busy={transcribing}
        onTranscribe={() =>
          void transcribeProject(project.id, queryClient)
        }
      />
    );
  } else if (!hasTranscript) {
    body = canEdit ? (
      <NeedsMediaState
        interrupted={null}
        onFile={(file) => void attachFile(project.id, file)}
      />
    ) : (
      <p className="py-16 text-center text-[13px] text-muted-foreground">
        No transcript yet.
      </p>
    );
  } else {
    body = (
      <ScriptView
        words={words}
        speakers={speakers}
        composition={composition}
        mediaDurationMs={mediaDurationMs}
        controller={controller}
        hideCuts={!showCuts}
        preview={cleanupMode}
        fillerPositions={fillerPositions}
        gapCandidates={gapCandidates}
        scrollRef={scrollRef}
        readOnly={!canEdit}
        onSelectionChange={setSelection}
        onRenameSpeaker={(speakerId, name) =>
          void editor.renameSpeaker(speakerId, name)
        }
      />
    );
  }

  const modKey = IS_MAC ? "⌘" : "Ctrl";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <EditorTopBar
        projectId={project.id}
        title={project.title}
        editable={canEdit}
        saving={editor.saving}
        exportDisabled={!hasTranscript}
        onRename={(title) => void editor.renameProject(title)}
      />
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-card">
          <div className="flex h-11 shrink-0 items-center gap-1 border-b border-border/70 px-3">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Undo"
                  disabled={!editor.canUndo || !canEdit}
                  onClick={editor.undo}
                >
                  <IconArrowBackUp size={17} aria-hidden />
                </Button>
              </TooltipTrigger>
              <TooltipContent className="flex items-center gap-1.5">
                Undo <Kbd>{modKey} Z</Kbd>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Redo"
                  disabled={!editor.canRedo || !canEdit}
                  onClick={editor.redo}
                >
                  <IconArrowForwardUp size={17} aria-hidden />
                </Button>
              </TooltipTrigger>
              <TooltipContent className="flex items-center gap-1.5">
                Redo <Kbd>{modKey} ⇧ Z</Kbd>
              </TooltipContent>
            </Tooltip>
            <span className="mx-1.5 h-5 w-px bg-border" aria-hidden />
            <CleanupMenu
              mode={cleanupMode}
              onModeChange={setCleanupMode}
              fillerCounts={fillerCounts}
              includeExtended={includeExtended}
              onIncludeExtendedChange={setIncludeExtended}
              maxGapMs={maxGapMs}
              onMaxGapChange={setMaxGapMs}
              gapStats={gapStats}
              hasTrims={hasTrims}
              disabled={!hasTranscript || !canEdit}
              onRemoveFillers={() =>
                void editor.removeFillers(
                  includeExtended
                    ? [...DEFAULT_FILLERS, ...OPTIONAL_FILLERS]
                    : undefined,
                )
              }
              onShortenGaps={() => void editor.shortenGaps(maxGapMs)}
              onRestorePauses={() => void editor.shortenGaps(null)}
            />
            <ViewMenu
              showCuts={showCuts}
              onShowCutsChange={setShowCuts}
              captions={captions}
              onCaptionsChange={setCaptions}
            />
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2.5 text-[13px]"
              disabled={!hasTranscript}
              onClick={() =>
                sendToAgentChat({
                  message:
                    "Clean up this transcript: remove filler words and shorten long silences, then tell me what you cut.",
                  context: `Project id: ${project.id}`,
                  submit: true,
                  openSidebar: true,
                })
              }
            >
              Clean up with agent
            </Button>
            {transcribing && hasTranscript ? (
              <span className="ml-auto text-[12px] text-muted-foreground">
                Re-transcribing…
              </span>
            ) : null}
          </div>
          <div
            ref={scrollRef}
            className="relative min-h-0 flex-1 overflow-y-auto"
          >
            <div className="mx-auto w-full max-w-[44rem] px-5 pb-24 pt-8 md:px-10">
              {body}
            </div>
            {selection && selectedWords.length > 0 && hasTranscript ? (
              <SelectionToolbar
                selection={selection}
                hasCut={showCuts && selectedWords.some((w) => w.deleted)}
                hasKept={selectedWords.some((w) => !w.deleted)}
                readOnly={!canEdit}
                onCut={cutSelection}
                onRestore={restoreSelection}
                onCorrect={
                  selection.from === selection.to ? startCorrect : null
                }
                onAskAgent={askAgent}
              />
            ) : null}
            <CorrectWordPopover
              anchor={correcting?.anchor ?? null}
              initialText={correcting?.text ?? ""}
              onClose={() => setCorrecting(null)}
              onSubmit={(text) => {
                if (correcting)
                  void editor.correctWord(correcting.position, text);
                setCorrecting(null);
              }}
            />
          </div>
        </section>
        <aside className="order-first shrink-0 border-b border-border bg-background p-3 lg:order-none lg:w-[min(42%,520px)] lg:border-b-0 lg:border-l lg:p-6">
          <MediaPreview
            controller={controller}
            mediaSrc={mediaSrc}
            mediaKind={project.mediaKind}
            words={words}
            speakers={speakers}
            composition={composition}
            mediaDurationMs={mediaDurationMs}
            captions={captions}
            note={previewNote}
          />
          <ExportJobs
            projectId={project.id}
            jobs={(sync.data?.jobs ?? []).filter(
              (job) => job.kind === "cutline-render" || job.kind === "proxy" || job.kind === "transcribe",
            )}
          />
        </aside>
      </div>
      <Timeline
        controller={controller}
        words={words}
        speakers={speakers}
        composition={composition}
        mediaDurationMs={mediaDurationMs}
      />
    </div>
  );
}

type VisibleJob = {
  id: string;
  kind: string;
  status: string;
  progress: number;
  progressLabel: string | null;
  error: string | null;
};

function ExportJobs({
  projectId,
  jobs,
}: {
  projectId: string;
  jobs: VisibleJob[];
}) {
  if (jobs.length === 0) return null;
  const open = async (jobId: string, file: "video" | "captions") => {
    const signed = await callAction(
      "open-export",
      { id: projectId, jobId, file },
      { method: "GET" },
    );
    window.open(signed.url, "_blank", "noopener,noreferrer");
  };
  return (
    <ul className="mt-4 flex flex-col gap-2 text-[12px]">
      {jobs.slice(0, 6).map((job) => (
        <li
          key={job.id}
          className="rounded-md border border-border bg-card px-3 py-2"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium capitalize">
              {job.kind.replace("-", " ")}
            </span>
            <span className="text-muted-foreground">
              {job.status}
              {job.status === "running" ? ` · ${job.progress}%` : ""}
            </span>
          </div>
          {job.progressLabel ? (
            <p className="mt-1 text-muted-foreground">{job.progressLabel}</p>
          ) : null}
          {job.error ? (
            <p className="mt-1 text-destructive">{job.error}</p>
          ) : null}
          {job.kind === "cutline-render" && job.status === "succeeded" ? (
            <div className="mt-2 flex gap-3">
              <button
                type="button"
                className="font-medium text-foreground underline-offset-2 hover:underline"
                onClick={() => void open(job.id, "video")}
              >
                Download MP4
              </button>
              <button
                type="button"
                className="font-medium text-foreground underline-offset-2 hover:underline"
                onClick={() => void open(job.id, "captions")}
              >
                Captions
              </button>
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
