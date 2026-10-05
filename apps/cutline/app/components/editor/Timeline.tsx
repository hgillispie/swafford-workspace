import {
  slotBounds,
  srcToOut,
  trailingGapMs,
  type Composition,
  type TranscriptSpeaker,
  type TranscriptWord,
} from "@shared/transcript";
import {
  IconPlayerPauseFilled,
  IconPlayerPlayFilled,
  IconRewindBackward5,
  IconRewindForward5,
  IconZoomIn,
  IconZoomOut,
} from "@tabler/icons-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatTimecode } from "@/lib/format";
import { speakerVar } from "@/lib/speakers";

import {
  usePlaybackState,
  usePlaybackTime,
  type PlaybackController,
} from "./playback";

const PAD = 16;
const HEIGHT = 92;
const RULER_Y = 14;
const TRACK_TOP = 30;
const TRACK_HEIGHT = 44;
const ZOOM_STEPS = [6, 10, 16, 24, 36, 54, 80, 120, 180, 260];

interface Block {
  start: number;
  end: number;
  speaker: number;
  text: string;
}

function cssHsl(name: string, alpha = 1): string {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return value ? `hsl(${value} / ${alpha})` : `rgba(128,128,128,${alpha})`;
}

function tickStep(pxPerSec: number): number {
  for (const step of [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600]) {
    if (step * pxPerSec >= 72) return step;
  }
  return 1200;
}

function TimeReadout({
  controller,
  composition,
  sourceMs,
}: {
  controller: PlaybackController;
  composition: Composition;
  sourceMs: number;
}) {
  const time = usePlaybackTime(controller);
  const out = srcToOut(composition, time);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="cursor-default select-none text-[13px] tabular-nums text-muted-foreground">
          <span className="font-medium text-foreground">
            {formatTimecode(out, { tenths: true })}
          </span>
          {" / "}
          {formatTimecode(composition.durationMs)}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        Original length {formatTimecode(sourceMs)}
      </TooltipContent>
    </Tooltip>
  );
}

export function Timeline({
  controller,
  words,
  speakers,
  composition,
  mediaDurationMs,
}: {
  controller: PlaybackController;
  words: TranscriptWord[];
  speakers: TranscriptSpeaker[];
  composition: Composition;
  mediaDurationMs: number;
}) {
  const { playing } = usePlaybackState(controller);
  const scrollRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const [zoomIndex, setZoomIndex] = useState(4);
  const [viewport, setViewport] = useState(0);
  const [themeVersion, setThemeVersion] = useState(0);
  const pxPerSec = ZOOM_STEPS[zoomIndex];
  const contentWidth = Math.max(
    viewport,
    (composition.durationMs / 1000) * pxPerSec + PAD * 2,
  );

  const blocks = useMemo<Block[]>(() => {
    const speakerIndex = new Map(speakers.map((s, i) => [s.id, i]));
    const list: Block[] = [];
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      if (word.deleted) continue;
      const slot = slotBounds(words, i, mediaDurationMs);
      const keptEnd =
        slot.end -
        Math.min(word.gapTrimMs, trailingGapMs(words, i, mediaDurationMs));
      const start = srcToOut(composition, word.startMs);
      const end =
        srcToOut(
          composition,
          Math.max(word.startMs, Math.min(word.endMs, keptEnd) - 1),
        ) + 1;
      list.push({
        start,
        end: Math.max(start + 40, end),
        speaker: word.speakerId ? (speakerIndex.get(word.speakerId) ?? 0) : 0,
        text: word.text,
      });
    }
    return list;
  }, [words, speakers, composition, mediaDurationMs]);

  const splices = useMemo(
    () => composition.segments.slice(1).map((s) => s.outStart),
    [composition],
  );

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const scroller = scrollRef.current;
    if (!canvas || !scroller || viewport === 0) return;
    const dpr = window.devicePixelRatio || 1;
    if (
      canvas.width !== Math.round(viewport * dpr) ||
      canvas.height !== HEIGHT * dpr
    ) {
      canvas.width = Math.round(viewport * dpr);
      canvas.height = HEIGHT * dpr;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, viewport, HEIGHT);
    const scrollLeft = scroller.scrollLeft;
    const toX = (ms: number) => PAD + (ms / 1000) * pxPerSec - scrollLeft;
    const t0 = ((scrollLeft - PAD) / pxPerSec) * 1000;
    const t1 = ((scrollLeft + viewport) / pxPerSec) * 1000;

    const step = tickStep(pxPerSec);
    ctx.font = "500 10.5px 'Inter Variable', Inter, sans-serif";
    ctx.textBaseline = "middle";
    const muted = cssHsl("--muted-foreground", 0.85);
    const faint = cssHsl("--muted-foreground", 0.3);
    for (
      let s = Math.max(0, Math.floor(t0 / 1000 / step) * step);
      s * 1000 <= t1;
      s += step
    ) {
      const x = toX(s * 1000);
      ctx.fillStyle = faint;
      ctx.fillRect(Math.round(x), RULER_Y + 7, 1, 5);
      ctx.fillStyle = muted;
      ctx.fillText(formatTimecode(s * 1000), Math.round(x) + 4, RULER_Y);
    }

    const trackEnd = toX(composition.durationMs);
    ctx.fillStyle = cssHsl("--muted", 1);
    ctx.beginPath();
    ctx.roundRect(
      toX(0),
      TRACK_TOP,
      Math.max(0, trackEnd - toX(0)),
      TRACK_HEIGHT,
      6,
    );
    ctx.fill();

    const colors =
      speakers.length > 0
        ? speakers.map((_, i) => cssHsl(speakerVar(i), 0.85))
        : [cssHsl("--primary", 0.8)];
    const showLabels = pxPerSec >= 80;
    for (const block of blocks) {
      if (block.end < t0 || block.start > t1) continue;
      const x = toX(block.start);
      const w = Math.max(
        1.5,
        ((block.end - block.start) / 1000) * pxPerSec - 1.5,
      );
      const lift = 6 + ((block.text.length * 7) % 9);
      ctx.fillStyle = colors[block.speaker % colors.length];
      ctx.beginPath();
      ctx.roundRect(
        x,
        TRACK_TOP + lift,
        w,
        TRACK_HEIGHT - lift * 2,
        Math.min(3, w / 2),
      );
      ctx.fill();
      if (showLabels && w > ctx.measureText(block.text).width + 6) {
        ctx.fillStyle = "rgba(255,255,255,0.95)";
        ctx.fillText(block.text, x + 3, TRACK_TOP + TRACK_HEIGHT / 2);
      }
    }

    ctx.fillStyle = cssHsl("--primary", 1);
    for (const ms of splices) {
      if (ms < t0 || ms > t1) continue;
      const x = Math.round(toX(ms));
      ctx.fillRect(x, TRACK_TOP - 1, 1, TRACK_HEIGHT + 2);
      ctx.beginPath();
      ctx.moveTo(x - 4, TRACK_TOP - 6);
      ctx.lineTo(x + 5, TRACK_TOP - 6);
      ctx.lineTo(x + 0.5, TRACK_TOP - 1);
      ctx.closePath();
      ctx.fill();
    }
  }, [
    blocks,
    splices,
    composition.durationMs,
    pxPerSec,
    speakers,
    viewport,
    themeVersion,
  ]);

  useLayoutEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const observer = new ResizeObserver(([entry]) =>
      setViewport(Math.floor(entry.contentRect.width)),
    );
    observer.observe(scroller);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const observer = new MutationObserver(() => setThemeVersion((v) => v + 1));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    draw();
  }, [draw]);

  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        draw();
      });
    };
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [draw]);

  useEffect(
    () =>
      controller.onTick((srcMs) => {
        const playhead = playheadRef.current;
        const scroller = scrollRef.current;
        if (!playhead || !scroller) return;
        const x =
          PAD +
          (srcToOut(controller.getComposition(), srcMs) / 1000) * pxPerSec;
        playhead.style.transform = `translateX(${x}px)`;
        if (controller.getSnapshot().playing && !draggingRef.current) {
          const view = scroller.clientWidth;
          if (
            x < scroller.scrollLeft + 24 ||
            x > scroller.scrollLeft + view - 48
          ) {
            scroller.scrollLeft = Math.max(0, x - view * 0.25);
          }
        }
      }),
    [controller, pxPerSec],
  );

  const seekFromEvent = (clientX: number) => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const rect = scroller.getBoundingClientRect();
    const x = clientX - rect.left + scroller.scrollLeft - PAD;
    controller.seekOut((x / pxPerSec) * 1000);
  };

  const zoom = (delta: number) => {
    const scroller = scrollRef.current;
    const next = Math.max(
      0,
      Math.min(ZOOM_STEPS.length - 1, zoomIndex + delta),
    );
    if (next === zoomIndex) return;
    const outMs = srcToOut(composition, controller.time);
    setZoomIndex(next);
    requestAnimationFrame(() => {
      if (!scroller) return;
      const x = PAD + (outMs / 1000) * ZOOM_STEPS[next];
      scroller.scrollLeft = Math.max(0, x - scroller.clientWidth / 2);
    });
  };

  return (
    <div className="shrink-0 border-t border-border bg-card">
      <div className="flex h-11 items-center gap-1.5 px-3">
        <Button
          size="icon-sm"
          className="rounded-full"
          aria-label={playing ? "Pause" : "Play"}
          onClick={() => controller.toggle()}
          disabled={composition.durationMs === 0}
        >
          {playing ? (
            <IconPlayerPauseFilled size={15} aria-hidden />
          ) : (
            <IconPlayerPlayFilled
              size={15}
              className="translate-x-px"
              aria-hidden
            />
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Back 5 seconds"
          onClick={() => controller.skip(-5000)}
        >
          <IconRewindBackward5 size={17} aria-hidden />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Forward 5 seconds"
          onClick={() => controller.skip(5000)}
        >
          <IconRewindForward5 size={17} aria-hidden />
        </Button>
        <span className="ml-1.5">
          <TimeReadout
            controller={controller}
            composition={composition}
            sourceMs={mediaDurationMs}
          />
        </span>
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Zoom out"
          onClick={() => zoom(-1)}
          disabled={zoomIndex === 0}
        >
          <IconZoomOut size={16} aria-hidden />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Zoom in"
          onClick={() => zoom(1)}
          disabled={zoomIndex === ZOOM_STEPS.length - 1}
        >
          <IconZoomIn size={16} aria-hidden />
        </Button>
      </div>
      <div
        ref={scrollRef}
        className="relative h-[92px] cursor-pointer overflow-x-auto overflow-y-hidden overscroll-x-contain"
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          draggingRef.current = true;
          event.currentTarget.setPointerCapture(event.pointerId);
          seekFromEvent(event.clientX);
        }}
        onPointerMove={(event) => {
          if (draggingRef.current) seekFromEvent(event.clientX);
        }}
        onPointerUp={(event) => {
          draggingRef.current = false;
          event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onWheel={(event) => {
          if (event.ctrlKey || event.metaKey) {
            event.preventDefault();
            zoom(event.deltaY < 0 ? 1 : -1);
          }
        }}
        role="group"
        aria-label="Timeline"
      >
        <div className="relative h-full" style={{ width: contentWidth }}>
          <canvas
            ref={canvasRef}
            className="pointer-events-none sticky left-0 top-0 block h-[92px]"
            style={{ width: viewport }}
          />
          <div
            ref={playheadRef}
            className="pointer-events-none absolute left-0 top-[22px] h-[60px] w-px bg-playhead will-change-transform"
            aria-hidden
          >
            <span className="absolute -left-[5px] -top-1 size-[11px] rounded-full border-2 border-card bg-playhead" />
          </div>
        </div>
      </div>
    </div>
  );
}
