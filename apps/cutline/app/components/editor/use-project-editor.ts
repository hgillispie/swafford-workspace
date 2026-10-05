import {
  actionErrorMessage,
  callAction,
  useActionQuery,
} from "@agent-native/core/client/hooks";
import type { ProjectSummary } from "@shared/project";
import {
  applyPatches,
  findFillers,
  planSetDeleted,
  planShortenGaps,
  rangesFromPositions,
  type PositionRange,
  type TranscriptSpeaker,
  type TranscriptWord,
  type WordPatch,
} from "@shared/transcript";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

export interface EditorData {
  project: ProjectSummary;
  canEdit: boolean;
  speakers: TranscriptSpeaker[];
  words: TranscriptWord[];
}

interface Plan {
  before: WordPatch[];
  after: WordPatch[];
}

interface HistoryEntry extends Plan {
  label: string;
}

const EMPTY_WORDS: TranscriptWord[] = [];
const EMPTY_SPEAKERS: TranscriptSpeaker[] = [];

export function useProjectEditor(projectId: string) {
  const queryClient = useQueryClient();
  const queryKey = useMemo(
    () => ["action", "get-project", { id: projectId }],
    [projectId],
  );
  const query = useActionQuery(
    "get-project",
    { id: projectId },
    {
      refetchInterval: (q) =>
        (q.state.data as EditorData | undefined)?.project.transcriptStatus ===
        "processing"
          ? 4000
          : false,
    },
  );
  const data = query.data as EditorData | undefined;
  const dataRef = useRef<EditorData | undefined>(data);
  dataRef.current = data;

  const [history, setHistory] = useState<{
    undo: HistoryEntry[];
    redo: HistoryEntry[];
  }>({
    undo: [],
    redo: [],
  });
  const [pending, setPending] = useState(0);
  const pendingRef = useRef(0);
  const transcriptIdentity = data?.words[0]?.id ?? null;

  useEffect(() => {
    setHistory({ undo: [], redo: [] });
  }, [projectId, transcriptIdentity]);

  const setData = useCallback(
    (update: (current: EditorData) => EditorData) => {
      queryClient.setQueryData<EditorData>(queryKey, (current) =>
        current ? update(current) : current,
      );
    },
    [queryClient, queryKey],
  );

  const settle = useCallback(() => {
    pendingRef.current -= 1;
    setPending(pendingRef.current);
    if (pendingRef.current === 0) {
      void queryClient.invalidateQueries({ queryKey });
      void queryClient.invalidateQueries({
        queryKey: ["action", "list-projects"],
      });
    }
  }, [queryClient, queryKey]);

  const runEdit = useCallback(
    async (
      label: string,
      plan: Plan,
      call: () => Promise<unknown>,
      options: { record?: "push" | "replay"; onError?: () => void } = {
        record: "push",
      },
    ) => {
      if (plan.after.length === 0) return false;
      await queryClient.cancelQueries({ queryKey });
      setData((current) => ({
        ...current,
        words: applyPatches(current.words, plan.after),
      }));
      const entry: HistoryEntry = {
        label,
        before: plan.before,
        after: plan.after,
      };
      if (options.record === "push") {
        setHistory((h) => ({ undo: [...h.undo.slice(-99), entry], redo: [] }));
      }
      pendingRef.current += 1;
      setPending(pendingRef.current);
      try {
        await call();
        return true;
      } catch (error) {
        setData((current) => ({
          ...current,
          words: applyPatches(current.words, plan.before),
        }));
        if (options.record === "push") {
          setHistory((h) => ({
            undo: h.undo.filter((e) => e !== entry),
            redo: h.redo,
          }));
        }
        options.onError?.();
        toast.error(
          actionErrorMessage(error) ?? `Couldn't ${label.toLowerCase()}.`,
        );
        return false;
      } finally {
        settle();
      }
    },
    [queryClient, queryKey, setData, settle],
  );

  const mediaDurationMs = useCallback(() => {
    const current = dataRef.current;
    if (!current) return 0;
    const last = current.words[current.words.length - 1];
    return Math.max(current.project.durationMs, last?.endMs ?? 0);
  }, []);

  const setDeleted = useCallback(
    (ranges: PositionRange[], deleted: boolean) => {
      const current = dataRef.current;
      if (!current || ranges.length === 0) return Promise.resolve(false);
      const plan = planSetDeleted(current.words, ranges, deleted);
      return runEdit(deleted ? "Cut" : "Restore", plan, () =>
        callAction("set-words-deleted", { projectId, ranges, deleted }),
      );
    },
    [projectId, runEdit],
  );

  const removeFillers = useCallback(
    (fillers?: string[]) => {
      const current = dataRef.current;
      if (!current) return Promise.resolve(false);
      const matches = findFillers(current.words, fillers);
      const positions = matches.flatMap((m) => m.positions);
      const plan = planSetDeleted(
        current.words,
        rangesFromPositions(positions),
        true,
      );
      return runEdit("Remove filler words", plan, () =>
        callAction("remove-filler-words", {
          projectId,
          ...(fillers ? { fillers } : {}),
        }),
      );
    },
    [projectId, runEdit],
  );

  const shortenGaps = useCallback(
    (maxGapMs: number | null) => {
      const current = dataRef.current;
      if (!current) return Promise.resolve(false);
      const plan = planShortenGaps(current.words, mediaDurationMs(), maxGapMs);
      return runEdit(
        maxGapMs === null ? "Restore pauses" : "Shorten pauses",
        plan,
        () =>
          callAction(
            "shorten-gaps",
            maxGapMs === null
              ? { projectId, clear: true }
              : { projectId, maxGapMs },
          ),
      );
    },
    [mediaDurationMs, projectId, runEdit],
  );

  const correctWord = useCallback(
    (position: number, text: string) => {
      const current = dataRef.current;
      const word = current?.words.find((w) => w.position === position);
      if (!word || word.text === text) return Promise.resolve(false);
      const plan = {
        before: [{ position, text: word.text }],
        after: [{ position, text }],
      };
      setData((d) => ({
        ...d,
        words: d.words.map((w) =>
          w.position === position
            ? { ...w, originalText: w.originalText ?? w.text }
            : w,
        ),
      }));
      return runEdit("Correct word", plan, () =>
        callAction("correct-word", { projectId, position, text }),
      );
    },
    [projectId, runEdit, setData],
  );

  const undo = useCallback(() => {
    const entry = history.undo[history.undo.length - 1];
    if (!entry) return;
    setHistory((h) => ({
      undo: h.undo.slice(0, -1),
      redo: [...h.redo, entry],
    }));
    void runEdit(
      `Undo ${entry.label.toLowerCase()}`,
      { before: entry.after, after: entry.before },
      () => callAction("patch-words", { projectId, patches: entry.before }),
      {
        record: "replay",
        onError: () =>
          setHistory((h) => ({
            undo: [...h.undo, entry],
            redo: h.redo.filter((e) => e !== entry),
          })),
      },
    );
  }, [history.undo, projectId, runEdit]);

  const redo = useCallback(() => {
    const entry = history.redo[history.redo.length - 1];
    if (!entry) return;
    setHistory((h) => ({
      undo: [...h.undo, entry],
      redo: h.redo.slice(0, -1),
    }));
    void runEdit(
      `Redo ${entry.label.toLowerCase()}`,
      { before: entry.before, after: entry.after },
      () => callAction("patch-words", { projectId, patches: entry.after }),
      {
        record: "replay",
        onError: () =>
          setHistory((h) => ({
            undo: h.undo.filter((e) => e !== entry),
            redo: [...h.redo, entry],
          })),
      },
    );
  }, [history.redo, projectId, runEdit]);

  const renameSpeaker = useCallback(
    async (speakerId: string, name: string) => {
      const previous = dataRef.current?.speakers;
      setData((d) => ({
        ...d,
        speakers: d.speakers.map((s) =>
          s.id === speakerId ? { ...s, name } : s,
        ),
      }));
      pendingRef.current += 1;
      setPending(pendingRef.current);
      try {
        await callAction("update-speaker", { projectId, speakerId, name });
      } catch (error) {
        if (previous) setData((d) => ({ ...d, speakers: previous }));
        toast.error(
          actionErrorMessage(error) ?? "Couldn't rename the speaker.",
        );
      } finally {
        settle();
      }
    },
    [projectId, setData, settle],
  );

  const renameProject = useCallback(
    async (title: string) => {
      const previous = dataRef.current?.project.title;
      setData((d) => ({ ...d, project: { ...d.project, title } }));
      pendingRef.current += 1;
      setPending(pendingRef.current);
      try {
        await callAction("update-project", { id: projectId, title });
      } catch (error) {
        if (previous)
          setData((d) => ({
            ...d,
            project: { ...d.project, title: previous },
          }));
        toast.error(
          actionErrorMessage(error) ?? "Couldn't rename the project.",
        );
      } finally {
        settle();
      }
    },
    [projectId, setData, settle],
  );

  return {
    query,
    project: data?.project ?? null,
    canEdit: data?.canEdit ?? false,
    words: data?.words ?? EMPTY_WORDS,
    speakers: data?.speakers ?? EMPTY_SPEAKERS,
    saving: pending > 0,
    canUndo: history.undo.length > 0,
    canRedo: history.redo.length > 0,
    setDeleted,
    removeFillers,
    shortenGaps,
    correctWord,
    undo,
    redo,
    renameSpeaker,
    renameProject,
  };
}

export type ProjectEditor = ReturnType<typeof useProjectEditor>;
