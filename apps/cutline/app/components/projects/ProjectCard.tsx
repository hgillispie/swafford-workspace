import type { ProjectSummary } from "@shared/project";
import {
  IconAlertTriangle,
  IconDots,
  IconHeadphones,
  IconMovie,
  IconPencil,
  IconTrash,
} from "@tabler/icons-react";
import { Link } from "react-router";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { formatDuration, formatRelative } from "@/lib/format";
import { useImportState } from "@/lib/import-store";
import { cn } from "@/lib/utils";

import { SpeechPrint } from "./SpeechPrint";

function StatusPill({ project }: { project: ProjectSummary }) {
  const importState = useImportState(project.id);
  const phase =
    importState?.phase === "uploading"
      ? "Uploading"
      : importState?.phase === "transcribing" ||
          project.transcriptStatus === "processing"
        ? "Transcribing"
        : project.transcriptStatus === "failed" ||
            importState?.phase === "failed"
          ? "Needs attention"
          : null;
  if (!phase) return null;
  const failed = phase === "Needs attention";
  return (
    <span
      className={cn(
        "absolute left-2 top-2 flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium shadow-sm",
        failed ? "bg-card text-destructive" : "bg-card text-foreground",
      )}
    >
      {failed ? (
        <IconAlertTriangle size={12} aria-hidden />
      ) : (
        <Spinner className="size-3" />
      )}
      {phase}
    </span>
  );
}

function Thumbnail({ project }: { project: ProjectSummary }) {
  if (project.mediaKind === "video" && project.mediaUrl) {
    return (
      <video
        src={`${project.mediaUrl}#t=0.5`}
        preload="metadata"
        muted
        playsInline
        tabIndex={-1}
        className="size-full object-cover"
      />
    );
  }
  if (project.speechPrint) return <SpeechPrint print={project.speechPrint} />;
  const PlaceholderIcon =
    project.mediaKind === "audio" ? IconHeadphones : IconMovie;
  return (
    <div className="flex size-full items-center justify-center text-muted-foreground/60">
      <PlaceholderIcon size={28} stroke={1.4} aria-hidden />
    </div>
  );
}

export function ProjectCard({
  project,
  onRename,
  onDelete,
}: {
  project: ProjectSummary;
  onRename: (project: ProjectSummary) => void;
  onDelete: (project: ProjectSummary) => void;
}) {
  const duration = project.editedDurationMs || project.durationMs;
  const meta = [
    project.isSample ? "Sample" : null,
    !project.ownedByMe ? "Shared" : null,
    `Edited ${formatRelative(project.updatedAt)}`,
  ].filter(Boolean);

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-lg border border-border bg-card transition-[border-color,box-shadow] duration-150 hover:border-foreground/20 hover:shadow-[0_2px_10px_-4px_hsl(var(--foreground)/0.18)] focus-within:border-primary/60">
      <div className="relative aspect-video overflow-hidden border-b border-border/70 bg-muted/60">
        <Thumbnail project={project} />
        <StatusPill project={project} />
        {duration > 0 ? (
          <span className="absolute bottom-2 right-2 rounded bg-foreground/80 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-background">
            {formatDuration(duration)}
          </span>
        ) : null}
      </div>
      <div className="flex items-start gap-1 py-2.5 pl-3 pr-1.5">
        <div className="min-w-0 flex-1">
          <Link
            to={`/projects/${project.id}`}
            className="block truncate text-[14px] font-medium leading-5 text-foreground outline-none after:absolute after:inset-0 after:content-['']"
          >
            {project.title}
          </Link>
          <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
            {meta.join(" · ")}
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="relative z-10 -mr-0.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
              aria-label={`Options for ${project.title}`}
            >
              <IconDots size={16} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuGroup>
              <DropdownMenuItem onSelect={() => onRename(project)}>
                <IconPencil size={15} aria-hidden />
                Rename
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem
                onSelect={() => onDelete(project)}
                disabled={!project.ownedByMe}
                className="text-destructive focus:text-destructive"
              >
                <IconTrash size={15} aria-hidden />
                Delete
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
