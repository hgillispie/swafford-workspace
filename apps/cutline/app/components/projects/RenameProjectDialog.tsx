import type { ProjectSummary } from "@shared/project";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export function RenameProjectDialog({
  project,
  onOpenChange,
  onSubmit,
}: {
  project: ProjectSummary | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (project: ProjectSummary, title: string) => void;
}) {
  const [title, setTitle] = useState("");

  useEffect(() => {
    if (project) setTitle(project.title);
  }, [project]);

  const trimmed = title.trim();

  return (
    <Dialog open={!!project} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form
          className="flex flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            if (project && trimmed) onSubmit(project, trimmed);
          }}
        >
          <DialogHeader>
            <DialogTitle>Rename project</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={title}
            maxLength={200}
            aria-label="Project title"
            onChange={(event) => setTitle(event.target.value)}
            onFocus={(event) => event.currentTarget.select()}
          />
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!trimmed || trimmed === project?.title}
            >
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
