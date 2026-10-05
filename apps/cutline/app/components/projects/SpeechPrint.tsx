import { parseSpeechPrint } from "@shared/transcript";
import { useMemo } from "react";

import { speakerBg } from "@/lib/speakers";
import { cn } from "@/lib/utils";

const HEIGHTS = [
  "h-[6%]",
  "h-[14%]",
  "h-[22%]",
  "h-[30%]",
  "h-[38%]",
  "h-[46%]",
  "h-[54%]",
  "h-[62%]",
  "h-[70%]",
  "h-[78%]",
];

export function SpeechPrint({
  print,
  className,
}: {
  print: string;
  className?: string;
}) {
  const bars = useMemo(() => parseSpeechPrint(print), [print]);
  if (bars.length === 0) return null;
  return (
    <div
      aria-hidden
      className={cn(
        "flex h-full w-full items-center justify-center gap-[3px] px-[9%]",
        className,
      )}
    >
      {bars.map((bar, i) => (
        <span
          key={i}
          className={cn(
            "min-w-[2px] flex-1 rounded-full transition-[opacity] duration-200",
            HEIGHTS[Math.max(0, Math.min(9, bar.level))],
            bar.level === 0 ? "bg-muted-foreground/25" : speakerBg(bar.speaker),
            bar.level > 0 && "opacity-90 group-hover:opacity-100",
          )}
        />
      ))}
    </div>
  );
}
