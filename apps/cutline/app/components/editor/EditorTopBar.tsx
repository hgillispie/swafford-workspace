import { ShareButton } from "@agent-native/toolkit/app/sharing";
import { IconArrowLeft, IconCheck } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { Link } from "react-router";

import { AgentButton } from "@/components/layout/PageHeader";
import { Spinner } from "@/components/ui/spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { ExportMenu } from "./EditorMenus";

function TitleField({
  title,
  editable,
  onRename,
}: {
  title: string;
  editable: boolean;
  onRename: (title: string) => void;
}) {
  const [value, setValue] = useState(title);
  useEffect(() => setValue(title), [title]);
  const commit = () => {
    const next = value.trim();
    if (next && next !== title) onRename(next);
    else setValue(title);
  };
  if (!editable) {
    return <h1 className="truncate text-[14px] font-semibold">{title}</h1>;
  }
  return (
    <input
      value={value}
      aria-label="Project title"
      maxLength={200}
      onChange={(event) => setValue(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          setValue(title);
          requestAnimationFrame(() =>
            (event.target as HTMLInputElement).blur(),
          );
        }
      }}
      className="min-w-0 max-w-[28rem] flex-1 truncate rounded-md border border-transparent bg-transparent px-2 py-1 text-[14px] font-semibold outline-none transition-colors hover:border-border focus:border-ring focus:bg-card"
    />
  );
}

function SaveState({ saving }: { saving: boolean }) {
  const [showSaved, setShowSaved] = useState(false);
  useEffect(() => {
    if (saving) {
      setShowSaved(false);
      return;
    }
    setShowSaved(true);
    const timer = window.setTimeout(() => setShowSaved(false), 2200);
    return () => window.clearTimeout(timer);
  }, [saving]);
  if (saving) {
    return (
      <span
        className="flex items-center gap-1.5 text-[12px] text-muted-foreground"
        aria-live="polite"
      >
        <Spinner className="size-3" />
        Saving
      </span>
    );
  }
  return (
    <span
      className="flex items-center gap-1 text-[12px] text-muted-foreground transition-opacity duration-300 data-[hidden=true]:opacity-0"
      data-hidden={showSaved ? "false" : "true"}
      aria-live="polite"
    >
      <IconCheck size={13} aria-hidden />
      Saved
    </span>
  );
}

export function EditorTopBar({
  projectId,
  title,
  editable,
  saving,
  exportDisabled,
  onRename,
}: {
  projectId: string;
  title: string;
  editable: boolean;
  saving: boolean;
  exportDisabled: boolean;
  onRename: (title: string) => void;
}) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-card px-2 md:px-3">
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            to="/"
            aria-label="Back to projects"
            className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <IconArrowLeft size={17} aria-hidden />
          </Link>
        </TooltipTrigger>
        <TooltipContent>Projects</TooltipContent>
      </Tooltip>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <TitleField title={title} editable={editable} onRename={onRename} />
        <span className="hidden sm:block">
          <SaveState saving={saving} />
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <span className="hidden sm:block">
          <ShareButton
            resourceType="project"
            resourceId={projectId}
            resourceTitle={title}
          />
        </span>
        <ExportMenu projectId={projectId} disabled={exportDisabled} />
        <AgentButton />
      </div>
    </header>
  );
}
