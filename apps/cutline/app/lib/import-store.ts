import { actionErrorMessage, callAction } from "@agent-native/core/client/hooks";
import type { QueryClient } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";

export type ImportPhase = "uploading" | "transcribing" | "failed" | "done";

export interface ImportState {
  phase: ImportPhase;
  progress: number;
  error?: string;
  errorCode?: string;
}

const states = new Map<string, ImportState>();
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function setState(key: string, state: ImportState | null) {
  if (state) states.set(key, state);
  else states.delete(key);
  emit();
}

export function useImportState(projectId: string | null | undefined) {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => (projectId ? (states.get(projectId) ?? null) : null),
    () => null,
  );
}

async function mapPool<T>(
  items: T[],
  limit: number,
  run: (item: T) => Promise<void>,
) {
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (cursor < items.length) {
        const item = items[cursor];
        cursor += 1;
        await run(item);
      }
    }),
  );
}

async function putPart(url: string, body: Blob): Promise<string> {
  let lastError = "Upload part failed.";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(url, { method: "PUT", body });
    const etag = response.headers.get("etag");
    if (response.ok && etag) return etag;
    lastError = response.ok
      ? "Storage did not expose the part ETag."
      : `Part upload failed (${response.status}).`;
  }
  throw new Error(lastError);
}

export async function uploadVideoFile(
  file: File,
  onProgress: (ratio: number) => void,
): Promise<{ id: string }> {
  const started = (await callAction("start-video-upload", {
    filename: file.name,
    sizeBytes: file.size,
    contentType: file.type || "application/octet-stream",
  })) as { id: string; partSize: number; partCount: number };
  const done = new Map<number, string>();
  let loaded = 0;
  const missing = Array.from({ length: started.partCount }, (_, i) => i + 1);
  for (let start = 0; start < missing.length; start += 20) {
    const partNumbers = missing.slice(start, start + 20);
    const signed = (await callAction("sign-video-parts", {
      id: started.id,
      partNumbers,
    })) as { parts: Array<{ partNumber: number; url: string }> };
    await mapPool(signed.parts, 4, async (part) => {
      const offset = (part.partNumber - 1) * started.partSize;
      const blob = file.slice(offset, offset + started.partSize);
      const etag = await putPart(part.url, blob);
      done.set(part.partNumber, etag);
      loaded += blob.size;
      onProgress(file.size ? loaded / file.size : 1);
    });
  }
  const probe = await probeDuration(file);
  const finished = (await callAction("complete-video-upload", {
    id: started.id,
    title: file.name.replace(/\.[^.]+$/, ""),
    parts: [...done.entries()].map(([partNumber, etag]) => ({
      partNumber,
      etag,
    })),
    durationMs: probe.durationMs || undefined,
    mediaWidth: probe.width ?? undefined,
    mediaHeight: probe.height ?? undefined,
  })) as { project: { id: string } };
  return { id: finished.project.id };
}

function probeDuration(
  file: File,
): Promise<{ durationMs: number; width: number | null; height: number | null }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      resolve({
        durationMs: Number.isFinite(video.duration)
          ? Math.round(video.duration * 1000)
          : 0,
        width: video.videoWidth || null,
        height: video.videoHeight || null,
      });
      URL.revokeObjectURL(url);
    };
    video.onerror = () => {
      resolve({ durationMs: 0, width: null, height: null });
      URL.revokeObjectURL(url);
    };
    video.src = url;
  });
}

export function uploadError(error: unknown): string {
  return (
    actionErrorMessage(error) ??
    (error instanceof Error ? error.message : "Upload failed.")
  );
}

export function rememberUploadProgress(key: string, progress: number) {
  setState(key, { phase: "uploading", progress });
}

export function failUpload(key: string, error: unknown) {
  setState(key, {
    phase: "failed",
    progress: 0,
    error: uploadError(error),
    errorCode: "failed",
  });
}

export function clearUpload(key: string) {
  setState(key, null);
}

export function hasPendingFile(_projectId: string): boolean {
  return false;
}

export function retryImport(
  _projectId: string,
  _queryClient: QueryClient,
): void {}

export async function transcribeProject(
  projectId: string,
  queryClient: QueryClient,
): Promise<void> {
  await callAction("transcribe-project", { id: projectId, force: true });
  void queryClient.invalidateQueries({ queryKey: ["action"] });
}
