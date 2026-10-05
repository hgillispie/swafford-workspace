import { buildSettingsRoute } from "@agent-native/core/client/navigation";
import { useFileUploadStatus } from "@agent-native/core/client/uploads";
import { IconCloudUpload, IconPlugConnected } from "@tabler/icons-react";
import { useRef, useState, type DragEvent } from "react";
import { Link } from "react-router";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { ACCEPTED_MEDIA } from "@/lib/media";
import { cn } from "@/lib/utils";

import { ConnectBuilderButton } from "./ConnectBuilderButton";

export function firstDroppedFile(event: DragEvent): File | null {
  const files = event.dataTransfer?.files;
  return files && files.length > 0 ? files[0] : null;
}

export function MediaDropZone({
  onFile,
  pending,
  className,
}: {
  onFile: (file: File) => void;
  pending?: boolean;
  className?: string;
}) {
  const status = useFileUploadStatus();
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const configured = status.data?.configured === true;

  if (status.isLoading) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border p-10",
          className,
        )}
      >
        <Skeleton className="size-11 rounded-xl" />
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-8 w-32" />
      </div>
    );
  }

  if (!configured) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center rounded-xl border border-border bg-card p-10 text-center",
          className,
        )}
      >
        <span className="mb-4 flex size-11 items-center justify-center rounded-xl bg-highlight text-primary">
          <IconPlugConnected size={22} stroke={1.7} aria-hidden />
        </span>
        <p className="max-w-sm text-[15px] font-semibold tracking-[-0.01em]">
          Connect Builder.io to upload and transcribe media
        </p>
        <div className="mt-5 flex flex-col items-center gap-2.5">
          <ConnectBuilderButton />
          <Link
            to={buildSettingsRoute("infra", null, { anchor: "uploads" })}
            className="text-[12px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Use your own S3 storage
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative flex flex-col items-center justify-center rounded-xl border border-dashed p-10 text-center transition-[background-color,border-color] duration-150",
        over
          ? "border-primary bg-highlight"
          : "border-border bg-card hover:border-foreground/25",
        className,
      )}
      onDragOver={(event) => {
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setOver(false);
        const file = firstDroppedFile(event);
        if (file) onFile(file);
      }}
    >
      <span
        className={cn(
          "mb-4 flex size-11 items-center justify-center rounded-xl transition-colors",
          over
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-muted-foreground",
        )}
      >
        {pending ? (
          <Spinner className="size-5" />
        ) : (
          <IconCloudUpload size={22} stroke={1.7} aria-hidden />
        )}
      </span>
      <p className="text-[15px] font-semibold tracking-[-0.01em]">
        {pending ? "Preparing your project…" : "Drop a video or audio file"}
      </p>
      <p className="mt-1 text-[12px] text-muted-foreground">
        MP4, MOV, MP3, WAV, M4A · up to 20 GB
      </p>
      <Button
        className="mt-5"
        variant="outline"
        disabled={pending}
        onClick={() => inputRef.current?.click()}
      >
        Browse files
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_MEDIA}
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) onFile(file);
        }}
      />
    </div>
  );
}
