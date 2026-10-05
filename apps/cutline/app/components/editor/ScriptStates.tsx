import {
  IconAlertTriangle,
  IconCloudUpload,
  IconWaveSine,
} from "@tabler/icons-react";

import { ConnectBuilderButton } from "@/components/projects/ConnectBuilderButton";
import { MediaDropZone } from "@/components/projects/MediaDropZone";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";

export function ScriptSkeleton() {
  return (
    <div className="flex flex-col gap-8" aria-hidden>
      {[0, 1, 2].map((block) => (
        <div key={block} className="flex flex-col gap-3">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-[92%]" />
          <Skeleton className="h-4 w-[64%]" />
        </div>
      ))}
    </div>
  );
}

function StatePanel({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-border bg-card px-6 py-10 text-center">
      <span className="mb-4 flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        {icon}
      </span>
      <p className="text-[15px] font-semibold tracking-[-0.01em]">{title}</p>
      {children}
    </div>
  );
}

export function UploadingState({ progress }: { progress: number }) {
  const percent = Math.round(progress * 100);
  return (
    <StatePanel
      icon={<IconCloudUpload size={22} stroke={1.7} aria-hidden />}
      title="Uploading media"
    >
      <div className="mt-5 flex w-full max-w-xs items-center gap-3">
        <Progress
          value={percent}
          className="h-1.5 flex-1"
          aria-label="Upload progress"
        />
        <span className="w-9 text-right text-[12px] tabular-nums text-muted-foreground">
          {percent}%
        </span>
      </div>
    </StatePanel>
  );
}

export function TranscribingState({
  progress,
  durationMs,
  starting = false,
}: {
  progress: number | null;
  durationMs: number;
  starting?: boolean;
}) {
  const percent = progress === null ? null : Math.round(progress * 100);
  const long = durationMs > 10 * 60 * 1000;
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <div
          className="flex items-center gap-2.5 text-[13px] font-medium text-muted-foreground"
          aria-live="polite"
        >
          {starting ? null : <Spinner className="size-4" />}
          {starting
            ? "Starting renderer…"
            : long
              ? "Transcribing with word timing — long recordings take a few minutes. Keep this tab open."
              : "Transcribing with word timing — usually under a minute"}
        </div>
        {percent !== null ? (
          <div className="flex max-w-xs items-center gap-3">
            <Progress
              value={percent}
              className="h-1.5 flex-1"
              aria-label="Transcription progress"
            />
            <span className="w-9 text-right text-[12px] tabular-nums text-muted-foreground">
              {percent}%
            </span>
          </div>
        ) : null}
      </div>
      <ScriptSkeleton />
    </div>
  );
}

export function NeedsTranscriptState({
  onTranscribe,
  busy,
}: {
  onTranscribe: () => void;
  busy: boolean;
}) {
  return (
    <StatePanel
      icon={<IconWaveSine size={22} stroke={1.7} aria-hidden />}
      title="Ready to transcribe"
    >
      <Button className="mt-5" onClick={onTranscribe} disabled={busy}>
        Transcribe
      </Button>
    </StatePanel>
  );
}

export function FailedState({
  message,
  needsConnection,
  canRetry,
  onRetry,
}: {
  message: string;
  needsConnection: boolean;
  canRetry: boolean;
  onRetry: () => void;
}) {
  return (
    <StatePanel
      icon={
        <IconAlertTriangle
          size={22}
          stroke={1.7}
          className="text-destructive"
          aria-hidden
        />
      }
      title={
        needsConnection
          ? "Connect Builder.io to continue"
          : "Something went wrong"
      }
    >
      <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-muted-foreground">
        {message}
      </p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        {needsConnection ? (
          <ConnectBuilderButton onConnected={canRetry ? onRetry : undefined} />
        ) : null}
        {canRetry ? (
          <Button
            variant={needsConnection ? "outline" : "default"}
            onClick={onRetry}
          >
            Try again
          </Button>
        ) : null}
      </div>
    </StatePanel>
  );
}

export function NeedsMediaState({
  onFile,
  interrupted,
}: {
  onFile: (file: File) => void;
  interrupted?: { name: string } | null;
}) {
  if (!interrupted)
    return <MediaDropZone onFile={onFile} className="min-h-72" />;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/50 px-3.5 py-3 text-[13px]">
        <IconCloudUpload
          size={16}
          stroke={1.8}
          className="mt-0.5 shrink-0 text-muted-foreground"
          aria-hidden
        />
        <p className="text-muted-foreground">
          The upload of{" "}
          <span className="font-medium text-foreground">
            {interrupted.name}
          </span>{" "}
          was interrupted. Choose the same file to continue where it left off.
        </p>
      </div>
      <MediaDropZone onFile={onFile} className="min-h-72" />
    </div>
  );
}
