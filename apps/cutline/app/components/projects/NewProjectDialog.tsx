import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { MediaDropZone } from "./MediaDropZone";

export function NewProjectDialog({
  open,
  onOpenChange,
  onFile,
  onSample,
  pending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onFile: (file: File) => void;
  onSample: () => void;
  pending: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-5 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
        </DialogHeader>
        <MediaDropZone onFile={onFile} pending={pending} className="min-h-64" />
        <button
          type="button"
          onClick={onSample}
          className="self-center text-[13px] font-medium text-muted-foreground underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:text-foreground focus-visible:underline"
        >
          Open the sample project instead
        </button>
      </DialogContent>
    </Dialog>
  );
}
