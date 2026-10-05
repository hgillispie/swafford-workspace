import {
  IconArrowBackUp,
  IconMessageCircle,
  IconPencil,
  IconScissors,
} from "@tabler/icons-react";
import { useEffect, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import type { ScriptSelection } from "./ScriptView";

function ToolbarButton({
  label,
  hint,
  onClick,
  children,
}: {
  label: string;
  hint?: ReactNode;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 px-2.5 text-[13px] text-popover-foreground hover:bg-accent"
          onClick={onClick}
        >
          {children}
          {label}
        </Button>
      </TooltipTrigger>
      {hint ? <TooltipContent>{hint}</TooltipContent> : null}
    </Tooltip>
  );
}

export function SelectionToolbar({
  selection,
  hasCut,
  hasKept,
  readOnly,
  onCut,
  onRestore,
  onCorrect,
  onAskAgent,
}: {
  selection: ScriptSelection;
  hasCut: boolean;
  hasKept: boolean;
  readOnly: boolean;
  onCut: () => void;
  onRestore: () => void;
  onCorrect: (() => void) | null;
  onAskAgent: () => void;
}) {
  const above = selection.top > 56;
  return (
    <div
      role="toolbar"
      aria-label="Selection"
      className="absolute z-30 flex -translate-x-1/2 items-center gap-0.5 rounded-lg border border-border bg-popover p-1 shadow-[0_8px_24px_-8px_hsl(var(--foreground)/0.28)] animate-in fade-in-0 zoom-in-95 duration-100"
      style={{
        top: above ? selection.top - 46 : selection.top + 34,
        left: Math.max(150, selection.left + selection.width / 2),
      }}
      onMouseDown={(event) => event.preventDefault()}
    >
      {!readOnly && hasKept ? (
        <ToolbarButton
          label="Cut"
          hint={
            <span className="flex items-center gap-1.5">
              Remove from the edit <Kbd>⌫</Kbd>
            </span>
          }
          onClick={onCut}
        >
          <IconScissors size={15} aria-hidden />
        </ToolbarButton>
      ) : null}
      {!readOnly && hasCut ? (
        <ToolbarButton
          label="Restore"
          hint="Bring back into the edit"
          onClick={onRestore}
        >
          <IconArrowBackUp size={15} aria-hidden />
        </ToolbarButton>
      ) : null}
      {!readOnly && onCorrect ? (
        <ToolbarButton
          label="Correct"
          hint="Fix the transcript text only"
          onClick={onCorrect}
        >
          <IconPencil size={15} aria-hidden />
        </ToolbarButton>
      ) : null}
      <span className="mx-0.5 h-5 w-px bg-border" aria-hidden />
      <ToolbarButton label="Ask agent" onClick={onAskAgent}>
        <IconMessageCircle size={15} aria-hidden />
      </ToolbarButton>
    </div>
  );
}

export function CorrectWordPopover({
  anchor,
  initialText,
  onSubmit,
  onClose,
}: {
  anchor: { top: number; left: number; width: number } | null;
  initialText: string;
  onSubmit: (text: string) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(initialText);

  useEffect(() => {
    setValue(initialText);
  }, [initialText, anchor]);

  const trimmed = value.trim();
  const valid = trimmed.length > 0 && !/\s/.test(trimmed);

  return (
    <Popover open={!!anchor} onOpenChange={(open) => !open && onClose()}>
      <PopoverAnchor asChild>
        <span
          aria-hidden
          className="pointer-events-none absolute h-6"
          style={
            anchor
              ? { top: anchor.top, left: anchor.left, width: anchor.width }
              : undefined
          }
        />
      </PopoverAnchor>
      <PopoverContent
        align="start"
        className="w-64 p-3"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <form
          className="flex flex-col gap-2.5"
          onSubmit={(event) => {
            event.preventDefault();
            if (!valid) return;
            onSubmit(trimmed);
          }}
        >
          <label
            htmlFor="correct-word"
            className="text-[12px] font-medium text-muted-foreground"
          >
            Correct transcript
          </label>
          <Input
            id="correct-word"
            autoFocus
            value={value}
            maxLength={80}
            onChange={(event) => setValue(event.target.value)}
            onFocus={(event) => event.currentTarget.select()}
            className="h-8 text-[13px]"
            aria-invalid={!valid}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={!valid || trimmed === initialText}
            >
              Save
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
