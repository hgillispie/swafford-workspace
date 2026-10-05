import {
  formatTimecode,
  groupParagraphs,
  PAUSE_MARK_MS,
  srcToOut,
  wordIndexAt,
  type Composition,
  type TranscriptSpeaker,
  type TranscriptWord,
} from "@shared/transcript";
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type RefObject,
} from "react";

import { cn } from "@/lib/utils";

import type { PlaybackController } from "./playback";
import { SpeakerLabel } from "./SpeakerLabel";

export interface ScriptSelection {
  from: number;
  to: number;
  top: number;
  left: number;
  width: number;
}

interface ScriptViewProps {
  words: TranscriptWord[];
  speakers: TranscriptSpeaker[];
  composition: Composition;
  mediaDurationMs: number;
  controller: PlaybackController;
  hideCuts: boolean;
  preview: "fillers" | "gaps" | null;
  fillerPositions: Set<number>;
  gapCandidates: Set<number>;
  scrollRef: RefObject<HTMLDivElement | null>;
  readOnly: boolean;
  onSelectionChange: (selection: ScriptSelection | null) => void;
  onRenameSpeaker: (speakerId: string, name: string) => void;
}

interface ParagraphWordsProps {
  words: TranscriptWord[];
  nextStartMs: number;
}

function sameWords(a: ParagraphWordsProps, b: ParagraphWordsProps) {
  if (a.nextStartMs !== b.nextStartMs || a.words.length !== b.words.length)
    return false;
  for (let i = 0; i < a.words.length; i++)
    if (a.words[i] !== b.words[i]) return false;
  return true;
}

const ParagraphWords = memo(function ParagraphWords({
  words,
  nextStartMs,
}: ParagraphWordsProps) {
  return (
    <p className="text-foreground/90">
      {words.map((word, i) => {
        const nextStart =
          i + 1 < words.length ? words[i + 1].startMs : nextStartMs;
        const gap = nextStart - word.endMs;
        return (
          <span
            key={word.id}
            className="script-word"
            data-pos={word.position}
            data-cut={word.deleted ? "true" : undefined}
            data-corrected={word.originalText ? "true" : undefined}
          >
            <span className="script-w">{word.text}</span>
            {gap >= PAUSE_MARK_MS ? (
              <span
                className="script-gap"
                data-trimmed={word.gapTrimMs > 0 ? "true" : undefined}
                title={`${(gap / 1000).toFixed(1)}s pause${word.gapTrimMs > 0 ? `, shortened by ${(word.gapTrimMs / 1000).toFixed(1)}s` : ""}`}
              />
            ) : null}{" "}
          </span>
        );
      })}
    </p>
  );
}, sameWords);

function wordElement(node: Node | null): HTMLElement | null {
  if (!node) return null;
  const el =
    node.nodeType === Node.ELEMENT_NODE
      ? (node as Element)
      : node.parentElement;
  return (el?.closest("[data-pos]") as HTMLElement | null) ?? null;
}

function boundaryPosition(
  node: Node,
  offset: number,
  edge: "start" | "end",
): number | null {
  const wordEl = wordElement(node);
  if (wordEl) {
    const pos = Number(wordEl.dataset.pos);
    const inText =
      node.nodeType === Node.TEXT_NODE &&
      node.parentElement?.classList.contains("script-w");
    if (inText) {
      const length = node.textContent?.length ?? 0;
      if (edge === "start" && offset >= length) return pos + 1;
      if (edge === "end" && offset === 0) return pos - 1;
      return pos;
    }
    if (node === wordEl && offset === 0)
      return edge === "start" ? pos : pos - 1;
    return edge === "start" ? pos + 1 : pos;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return null;
  const el = node as Element;
  if (edge === "start") {
    for (let i = offset; i < el.childNodes.length; i++) {
      const child = el.childNodes[i];
      if (child.nodeType !== Node.ELEMENT_NODE) continue;
      const match = (child as Element).matches("[data-pos]")
        ? (child as HTMLElement)
        : (child as Element).querySelector<HTMLElement>("[data-pos]");
      if (match) return Number(match.dataset.pos);
    }
    return null;
  }
  for (let i = Math.min(offset, el.childNodes.length) - 1; i >= 0; i--) {
    const child = el.childNodes[i];
    if (child.nodeType !== Node.ELEMENT_NODE) continue;
    if ((child as Element).matches("[data-pos]"))
      return Number((child as HTMLElement).dataset.pos);
    const all = (child as Element).querySelectorAll<HTMLElement>("[data-pos]");
    if (all.length > 0) return Number(all[all.length - 1].dataset.pos);
  }
  return null;
}

export function ScriptView({
  words,
  speakers,
  composition,
  mediaDurationMs,
  controller,
  hideCuts,
  preview,
  fillerPositions,
  gapCandidates,
  scrollRef,
  readOnly,
  onSelectionChange,
  onRenameSpeaker,
}: ScriptViewProps) {
  const docRef = useRef<HTMLDivElement>(null);
  const markerRef = useRef<HTMLDivElement>(null);
  const spansRef = useRef(new Map<number, HTMLElement>());
  const wordsRef = useRef(words);
  wordsRef.current = words;
  const activeRef = useRef(-1);
  const lastUserScrollRef = useRef(0);
  const selectionFrameRef = useRef(0);

  const paragraphs = useMemo(() => groupParagraphs(words), [words]);
  const speakerInfo = useMemo(() => {
    const map = new Map<string, { name: string; index: number }>();
    speakers.forEach((s, index) => map.set(s.id, { name: s.name, index }));
    return map;
  }, [speakers]);

  const placeMarker = useCallback((pos: number) => {
    const marker = markerRef.current;
    const doc = docRef.current;
    const text = pos >= 0 ? spansRef.current.get(pos)?.firstElementChild : null;
    if (!marker || !doc || !text) {
      if (marker) marker.dataset.visible = "false";
      return;
    }
    const rect = text.getClientRects()[0];
    if (!rect) {
      marker.dataset.visible = "false";
      return;
    }
    const docRect = doc.getBoundingClientRect();
    marker.style.transform = `translate(${rect.left - docRect.left}px, ${rect.bottom - docRect.top + 1}px) scaleX(${rect.width / 100})`;
    marker.dataset.visible = "true";
  }, []);

  const highlight = useCallback(
    (srcMs: number, force = false) => {
      const list = wordsRef.current;
      const index = wordIndexAt(list, srcMs);
      const word = index >= 0 ? list[index] : null;
      const pos =
        word && !word.deleted && srcMs <= word.endMs + 1500
          ? word.position
          : -1;
      if (pos === activeRef.current && !force) return;
      spansRef.current.get(activeRef.current)?.removeAttribute("data-active");
      activeRef.current = pos;
      const span = pos >= 0 ? spansRef.current.get(pos) : null;
      span?.setAttribute("data-active", "true");
      placeMarker(pos);
      const scroller = scrollRef.current;
      if (!span || !scroller || !controller.getSnapshot().playing) return;
      if (Date.now() - lastUserScrollRef.current < 3000) return;
      const spanRect = span.getBoundingClientRect();
      const viewRect = scroller.getBoundingClientRect();
      if (
        spanRect.top < viewRect.top + 72 ||
        spanRect.bottom > viewRect.bottom - 96
      ) {
        scroller.scrollTo({
          top:
            scroller.scrollTop +
            (spanRect.top - viewRect.top) -
            viewRect.height / 3,
          behavior: "smooth",
        });
      }
    },
    [controller, placeMarker, scrollRef],
  );

  useLayoutEffect(() => {
    const map = new Map<number, HTMLElement>();
    docRef.current
      ?.querySelectorAll("[data-active]")
      .forEach((el) => el.removeAttribute("data-active"));
    docRef.current
      ?.querySelectorAll<HTMLElement>("[data-pos]")
      .forEach((el) => {
        map.set(Number(el.dataset.pos), el);
      });
    spansRef.current = map;
    activeRef.current = -1;
    highlight(controller.time, true);
  }, [words, hideCuts, controller, highlight]);

  useEffect(
    () => controller.onTick((ms) => highlight(ms)),
    [controller, highlight],
  );

  useEffect(() => {
    const doc = docRef.current;
    if (!doc) return;
    const observer = new ResizeObserver(() => placeMarker(activeRef.current));
    observer.observe(doc);
    return () => observer.disconnect();
  }, [placeMarker]);

  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const mark = () => {
      lastUserScrollRef.current = Date.now();
    };
    scroller.addEventListener("wheel", mark, { passive: true });
    scroller.addEventListener("touchmove", mark, { passive: true });
    return () => {
      scroller.removeEventListener("wheel", mark);
      scroller.removeEventListener("touchmove", mark);
    };
  }, [scrollRef]);

  useEffect(() => {
    const spans = spansRef.current;
    for (const [pos, el] of spans) {
      if (preview === "fillers" && fillerPositions.has(pos))
        el.dataset.filler = "true";
      else delete el.dataset.filler;
      const gap = el.querySelector<HTMLElement>(".script-gap");
      if (gap) {
        if (preview === "gaps" && gapCandidates.has(pos))
          gap.dataset.candidate = "true";
        else delete gap.dataset.candidate;
      }
    }
  }, [preview, fillerPositions, gapCandidates, words, hideCuts]);

  useEffect(() => {
    const report = () => {
      selectionFrameRef.current = 0;
      const doc = docRef.current;
      const scroller = scrollRef.current;
      const selection = document.getSelection();
      if (
        !doc ||
        !scroller ||
        !selection ||
        selection.rangeCount === 0 ||
        selection.isCollapsed
      ) {
        onSelectionChange(null);
        return;
      }
      const range = selection.getRangeAt(0);
      if (!doc.contains(range.commonAncestorContainer)) {
        onSelectionChange(null);
        return;
      }
      const from = boundaryPosition(
        range.startContainer,
        range.startOffset,
        "start",
      );
      const to = boundaryPosition(range.endContainer, range.endOffset, "end");
      if (from === null || to === null || to < from) {
        onSelectionChange(null);
        return;
      }
      const rect = range.getBoundingClientRect();
      const viewRect = scroller.getBoundingClientRect();
      onSelectionChange({
        from,
        to,
        top: rect.top - viewRect.top + scroller.scrollTop,
        left: rect.left - viewRect.left + scroller.scrollLeft,
        width: rect.width,
      });
    };
    const onChange = () => {
      if (!selectionFrameRef.current)
        selectionFrameRef.current = requestAnimationFrame(report);
    };
    document.addEventListener("selectionchange", onChange);
    return () => {
      document.removeEventListener("selectionchange", onChange);
      cancelAnimationFrame(selectionFrameRef.current);
    };
  }, [onSelectionChange, scrollRef]);

  const seekToWord = useCallback(
    (position: number) => {
      const list = wordsRef.current;
      const index = list.findIndex((w) => w.position === position);
      if (index < 0) return;
      const target = list.slice(index).find((w) => !w.deleted) ?? list[index];
      controller.seekSrc(target.startMs);
    },
    [controller],
  );

  return (
    <div
      ref={docRef}
      className="script-doc"
      data-hide-cuts={hideCuts ? "true" : undefined}
      data-preview={preview ?? undefined}
      onClick={(event) => {
        const selection = document.getSelection();
        if (selection && !selection.isCollapsed) return;
        const el = wordElement(event.target as Node);
        if (el) seekToWord(Number(el.dataset.pos));
      }}
    >
      <div ref={markerRef} className="script-marker" aria-hidden />
      {paragraphs.map((paragraph, i) => {
        const info = paragraph.speakerId
          ? speakerInfo.get(paragraph.speakerId)
          : undefined;
        const firstKept = paragraph.words.find((w) => !w.deleted);
        const allCut = !firstKept;
        if (allCut && hideCuts) return null;
        const next = paragraphs[i + 1]?.words[0]?.startMs ?? mediaDurationMs;
        return (
          <section
            key={paragraph.words[0].id}
            className={cn("mb-7", allCut && "opacity-70")}
          >
            <header className="mb-1 flex select-none items-center gap-2.5">
              {info && paragraph.speakerId ? (
                <SpeakerLabel
                  name={info.name}
                  index={info.index}
                  disabled={readOnly}
                  onRename={(name) =>
                    onRenameSpeaker(paragraph.speakerId as string, name)
                  }
                />
              ) : null}
              <button
                type="button"
                className="rounded px-1 text-[12px] tabular-nums text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                onClick={(event) => {
                  event.stopPropagation();
                  seekToWord((firstKept ?? paragraph.words[0]).position);
                }}
                aria-label="Play from here"
              >
                {formatTimecode(
                  srcToOut(
                    composition,
                    (firstKept ?? paragraph.words[0]).startMs,
                  ),
                )}
              </button>
            </header>
            <ParagraphWords words={paragraph.words} nextStartMs={next} />
          </section>
        );
      })}
    </div>
  );
}
