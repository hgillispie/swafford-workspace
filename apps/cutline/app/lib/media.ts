export const ACCEPTED_MEDIA = "video/*,.mp4,.mov,.m4v,.webm,.mkv";

export type MediaKind = "video" | "audio";

export function mediaKindOf(file: File): MediaKind | null {
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  if (/\.(mp4|mov|m4v|webm|mkv)$/i.test(file.name)) return "video";
  if (/\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(file.name)) return "audio";
  return null;
}

export function titleFromFilename(name: string): string {
  const base = name
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .trim();
  return base
    ? base.charAt(0).toUpperCase() + base.slice(1)
    : "Untitled project";
}

const localMedia = new Map<string, string>();

/** Keep a playable object URL for media picked in this browser session. */
export function rememberLocalMedia(projectId: string, file: File): string {
  const existing = localMedia.get(projectId);
  if (existing) URL.revokeObjectURL(existing);
  const url = URL.createObjectURL(file);
  localMedia.set(projectId, url);
  return url;
}

export function localMediaUrl(projectId: string): string | null {
  return localMedia.get(projectId) ?? null;
}
