import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { speakerBg } from "@/lib/speakers";
import { cn } from "@/lib/utils";

export function SpeakerLabel({
  name,
  index,
  onRename,
  disabled,
}: {
  name: string;
  index: number;
  onRename: (name: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(name);

  useEffect(() => {
    if (open) setValue(name);
  }, [open, name]);

  const trimmed = value.trim();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        <button
          type="button"
          className="-ml-1.5 flex items-center gap-2 rounded-md px-1.5 py-0.5 text-[13px] font-semibold text-foreground outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none"
        >
          <span
            className={cn("size-2 rounded-full", speakerBg(index))}
            aria-hidden
          />
          {name}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-3">
        <form
          className="flex flex-col gap-2.5"
          onSubmit={(event) => {
            event.preventDefault();
            if (trimmed && trimmed !== name) onRename(trimmed);
            setOpen(false);
          }}
        >
          <label
            className="text-[12px] font-medium text-muted-foreground"
            htmlFor="speaker-name"
          >
            Speaker name
          </label>
          <Input
            id="speaker-name"
            autoFocus
            value={value}
            maxLength={80}
            onChange={(event) => setValue(event.target.value)}
            onFocus={(event) => event.currentTarget.select()}
            className="h-8 text-[13px]"
          />
          <Button
            type="submit"
            size="sm"
            disabled={!trimmed || trimmed === name}
          >
            Rename everywhere
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
