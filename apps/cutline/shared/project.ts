export type TranscriptStatus = "none" | "processing" | "ready" | "failed";

export interface ProjectSummary {
  id: string;
  title: string;
  mediaKind: "video" | "audio" | null;
  mediaUrl: string | null;
  mediaMimeType: string | null;
  mediaFilename: string | null;
  mediaSize: number | null;
  mediaWidth: number | null;
  mediaHeight: number | null;
  durationMs: number;
  editedDurationMs: number;
  transcriptStatus: TranscriptStatus;
  transcriptError: string | null;
  transcriptSource: string | null;
  language: string | null;
  speechPrint: string;
  isSample: boolean;
  createdAt: string;
  updatedAt: string;
  ownerEmail: string;
  ownedByMe: boolean;
  visibility: string;
}
