import {
  actionErrorMessage,
  callAction,
} from "@agent-native/core/client/hooks";
import {
  IconChevronDown,
  IconDownload,
  IconEye,
  IconFileText,
  IconTextCaption,
  IconWaveSine,
} from "@tabler/icons-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { formatSavedTime } from "@/lib/format";

export type CleanupMode = "fillers" | "gaps" | null;

export function CleanupMenu({
  mode,
  onModeChange,
  fillerCounts,
  includeExtended,
  onIncludeExtendedChange,
  maxGapMs,
  onMaxGapChange,
  gapStats,
  hasTrims,
  disabled,
  onRemoveFillers,
  onShortenGaps,
  onRestorePauses,
}: {
  mode: CleanupMode;
  onModeChange: (mode: CleanupMode) => void;
  fillerCounts: Record<string, number>;
  includeExtended: boolean;
  onIncludeExtendedChange: (value: boolean) => void;
  maxGapMs: number;
  onMaxGapChange: (value: number) => void;
  gapStats: { shortened: number; savedMs: number };
  hasTrims: boolean;
  disabled: boolean;
  onRemoveFillers: () => void;
  onShortenGaps: () => void;
  onRestorePauses: () => void;
}) {
  const fillerTotal = Object.values(fillerCounts).reduce(
    (sum, n) => sum + n,
    0,
  );
  const sortedCounts = Object.entries(fillerCounts).sort((a, b) => b[1] - a[1]);

  return (
    <Popover
      open={mode !== null}
      onOpenChange={(open) => !open && onModeChange(null)}
    >
      <DropdownMenu>
        <PopoverAnchor asChild>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1 px-2.5 text-[13px]"
              disabled={disabled}
            >
              Clean up
              <IconChevronDown
                size={14}
                className="text-muted-foreground"
                aria-hidden
              />
            </Button>
          </DropdownMenuTrigger>
        </PopoverAnchor>
        <DropdownMenuContent
          align="start"
          className="w-56"
          onCloseAutoFocus={(event) => event.preventDefault()}
        >
          <DropdownMenuGroup>
            <DropdownMenuItem onSelect={() => onModeChange("fillers")}>
              <IconTextCaption size={15} aria-hidden />
              Remove filler words…
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onModeChange("gaps")}>
              <IconWaveSine size={15} aria-hidden />
              Shorten pauses…
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <PopoverContent align="start" className="w-80 p-4">
        {mode === "fillers" ? (
          <div className="flex flex-col gap-4">
            <div>
              <p className="text-[14px] font-semibold">Filler words</p>
              {fillerTotal > 0 ? (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {sortedCounts.map(([phrase, count]) => (
                    <span
                      key={phrase}
                      className="rounded-md bg-warning/15 px-2 py-0.5 text-[12px] font-medium text-foreground"
                    >
                      {phrase}{" "}
                      <span className="tabular-nums text-muted-foreground">
                        {count}
                      </span>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="mt-1.5 text-[13px] text-muted-foreground">
                  No filler words left.
                </p>
              )}
            </div>
            <label className="flex items-center justify-between gap-3 text-[13px]">
              Include “like”, “you know”, “I mean”
              <Switch
                checked={includeExtended}
                onCheckedChange={onIncludeExtendedChange}
              />
            </label>
            <Button
              disabled={fillerTotal === 0}
              onClick={() => {
                onRemoveFillers();
                onModeChange(null);
              }}
            >
              Cut {fillerTotal} filler{fillerTotal === 1 ? "" : "s"}
            </Button>
          </div>
        ) : mode === "gaps" ? (
          <div className="flex flex-col gap-4">
            <div className="flex items-baseline justify-between">
              <p className="text-[14px] font-semibold">Pauses</p>
              <p className="text-[12px] tabular-nums text-muted-foreground">
                Keep up to {(maxGapMs / 1000).toFixed(1)}s
              </p>
            </div>
            <Slider
              value={[maxGapMs]}
              min={200}
              max={2000}
              step={100}
              onValueChange={([value]) => onMaxGapChange(value)}
              aria-label="Longest pause to keep"
            />
            <p className="text-[13px] text-muted-foreground">
              {gapStats.shortened > 0
                ? `${gapStats.shortened} pause${gapStats.shortened === 1 ? "" : "s"} · saves ${formatSavedTime(gapStats.savedMs)}`
                : "No pauses longer than this."}
            </p>
            <div className="flex flex-col gap-2">
              <Button
                disabled={gapStats.shortened === 0}
                onClick={() => {
                  onShortenGaps();
                  onModeChange(null);
                }}
              >
                Shorten pauses
              </Button>
              {hasTrims ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    onRestorePauses();
                    onModeChange(null);
                  }}
                >
                  Restore original pauses
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

export function ViewMenu({
  showCuts,
  onShowCutsChange,
  captions,
  onCaptionsChange,
}: {
  showCuts: boolean;
  onShowCutsChange: (value: boolean) => void;
  captions: boolean;
  onCaptionsChange: (value: boolean) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1 px-2.5 text-[13px]"
        >
          <IconEye size={15} className="text-muted-foreground" aria-hidden />
          View
          <IconChevronDown
            size={14}
            className="text-muted-foreground"
            aria-hidden
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        <DropdownMenuGroup>
          <DropdownMenuCheckboxItem
            checked={showCuts}
            onCheckedChange={(v) => onShowCutsChange(v === true)}
          >
            Show cut words
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={captions}
            onCheckedChange={(v) => onCaptionsChange(v === true)}
          >
            Captions in preview
          </DropdownMenuCheckboxItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function download(filename: string, mimeType: string, content: string) {
  const url = URL.createObjectURL(
    new Blob([content], { type: `${mimeType};charset=utf-8` }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ExportMenu({
  projectId,
  disabled,
}: {
  projectId: string;
  disabled: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const exportVideo = async (
    quality: "draft" | "standard" | "source",
    captions: "none" | "burn" | "sidecar",
  ) => {
    setBusy(true);
    try {
      const queued = await callAction("export-video", {
        id: projectId,
        quality,
        captions,
      });
      toast.success(
        `Export queued (${queued.jobId.slice(0, 8)}). The download appears when the worker finishes.`,
      );
    } catch (error) {
      toast.error(actionErrorMessage(error) ?? "Export failed.");
    } finally {
      setBusy(false);
    }
  };
  const run = async (format: "txt" | "srt" | "vtt") => {
    setBusy(true);
    try {
      const file = await callAction(
        "export-transcript",
        { projectId, format },
        { method: "GET" },
      );
      download(file.filename, file.mimeType, file.content);
    } catch (error) {
      toast.error(actionErrorMessage(error) ?? "Export failed.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" disabled={disabled || busy} className="gap-1.5">
          <IconDownload size={15} aria-hidden />
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="text-[12px] font-medium text-muted-foreground">
          Edited transcript
        </DropdownMenuLabel>
        <DropdownMenuGroup>
          <DropdownMenuItem onSelect={() => void run("txt")}>
            <IconFileText size={15} aria-hidden />
            Text with speakers (.txt)
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-[12px] font-medium text-muted-foreground">
          Captions
        </DropdownMenuLabel>
        <DropdownMenuGroup>
          <DropdownMenuItem onSelect={() => void run("srt")}>
            <IconTextCaption size={15} aria-hidden />
            SubRip (.srt)
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void run("vtt")}>
            <IconTextCaption size={15} aria-hidden />
            WebVTT (.vtt)
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-[12px] font-medium text-muted-foreground">
          Edited video
        </DropdownMenuLabel>
        <DropdownMenuGroup>
          <DropdownMenuItem onSelect={() => void exportVideo("standard", "burn")}>
            MP4 · 1080p · burned-in captions
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void exportVideo("standard", "sidecar")}>
            MP4 · 1080p · sidecar SRT
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void exportVideo("draft", "none")}>
            MP4 · 720p draft
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void exportVideo("source", "sidecar")}>
            MP4 · source size · sidecar SRT
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
