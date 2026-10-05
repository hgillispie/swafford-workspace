import {
  buildCues,
  computeSpeechPrint,
  srcToOut,
  wordIndexAt,
  type Composition,
  type TranscriptSpeaker,
  type TranscriptWord,
} from "@shared/transcript";
import { IconAlertTriangle, IconPlayerPlayFilled } from "@tabler/icons-react";
import { useCallback, useMemo, useState } from "react";

import { SpeechPrint } from "@/components/projects/SpeechPrint";
import { speakerBg } from "@/lib/speakers";
import { cn } from "@/lib/utils";

import {
  usePlaybackState,
  usePlaybackTime,
  type PlaybackController,
} from "./playback";

function CaptionLine({
  controller,
  cues,
  composition,
}: {
  controller: PlaybackController;
  cues: ReturnType<typeof buildCues>;
  composition: Composition;
}) {
  const time = usePlaybackTime(controller);
  const out = srcToOut(composition, time);
  const cue = cues.find((c) => out >= c.startMs && out < c.endMs + 250);
  if (!cue) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-[7%] flex justify-center px-[8%]">
      <span className="rounded-md bg-stage/80 px-2.5 py-1 text-center text-[clamp(12px,1.6vw,17px)] font-medium leading-snug text-stage-foreground">
        {cue.text}
      </span>
    </div>
  );
}

function CurrentSpeaker({
  controller,
  words,
  speakers,
}: {
  controller: PlaybackController;
  words: TranscriptWord[];
  speakers: TranscriptSpeaker[];
}) {
  const time = usePlaybackTime(controller);
  const index = wordIndexAt(words, time);
  const speakerId =
    index >= 0 ? words[index].speakerId : (words[0]?.speakerId ?? null);
  const speakerIndex = speakers.findIndex((s) => s.id === speakerId);
  if (speakerIndex < 0) return null;
  return (
    <span className="flex items-center gap-2 text-[13px] font-medium text-stage-foreground/90">
      <span
        className={cn("size-2 rounded-full", speakerBg(speakerIndex))}
        aria-hidden
      />
      {speakers[speakerIndex].name}
    </span>
  );
}

function PrintPlayhead({
  controller,
  composition,
}: {
  controller: PlaybackController;
  composition: Composition;
}) {
  const time = usePlaybackTime(controller);
  const ratio =
    composition.durationMs > 0
      ? srcToOut(composition, time) / composition.durationMs
      : 0;
  return (
    <span
      aria-hidden
      className="absolute inset-y-[18%] w-px bg-playhead shadow-[0_0_0_1px_hsl(var(--playhead)/0.25)]"
      style={{ left: `calc(9% + ${Math.min(1, Math.max(0, ratio)) * 82}%)` }}
    />
  );
}

export function MediaPreview({
  controller,
  mediaSrc,
  mediaKind,
  words,
  speakers,
  composition,
  mediaDurationMs,
  captions,
  note,
}: {
  controller: PlaybackController;
  mediaSrc: string | null;
  mediaKind: "video" | "audio" | null;
  words: TranscriptWord[];
  speakers: TranscriptSpeaker[];
  composition: Composition;
  mediaDurationMs: number;
  captions: boolean;
  note: string | null;
}) {
  const { playing } = usePlaybackState(controller);
  const [mediaError, setMediaError] = useState(false);
  const cues = useMemo(
    () => buildCues(words, mediaDurationMs),
    [words, mediaDurationMs],
  );
  const print = useMemo(
    () => computeSpeechPrint(words, speakers, mediaDurationMs),
    [words, speakers, mediaDurationMs],
  );
  const attach = useCallback(
    (element: HTMLMediaElement | null) => controller.attachMedia(element),
    [controller],
  );
  const isVideo = mediaKind === "video" && !!mediaSrc && !mediaError;
  const isAudio = mediaKind === "audio" && !!mediaSrc && !mediaError;

  return (
    <div className="flex flex-col gap-3">
      <div className="group/stage relative mx-auto aspect-video w-full max-w-[min(100%,calc(34vh*16/9))] overflow-hidden rounded-lg bg-stage shadow-[0_1px_0_hsl(var(--foreground)/0.04),0_12px_32px_-18px_hsl(var(--foreground)/0.45)] lg:max-w-none">
        {isVideo ? (
          <video
            key={mediaSrc}
            ref={attach}
            src={mediaSrc ?? undefined}
            playsInline
            preload="auto"
            className="size-full object-contain"
            onClick={() => controller.toggle()}
            onError={() => setMediaError(true)}
          />
        ) : (
          <div className="relative flex size-full flex-col">
            {isAudio ? (
              <audio
                key={mediaSrc}
                ref={attach}
                src={mediaSrc ?? undefined}
                preload="auto"
                className="hidden"
                onError={() => setMediaError(true)}
              />
            ) : null}
            <div className="flex items-center justify-between px-[5%] pt-[5%]">
              <CurrentSpeaker
                controller={controller}
                words={words}
                speakers={speakers}
              />
            </div>
            <div
              className="relative min-h-0 flex-1 py-[6%]"
              onClick={() => controller.toggle()}
            >
              {print ? (
                <>
                  <SpeechPrint print={print} className="gap-[2px]" />
                  <PrintPlayhead
                    controller={controller}
                    composition={composition}
                  />
                </>
              ) : null}
            </div>
          </div>
        )}
        {captions && words.length > 0 ? (
          <CaptionLine
            controller={controller}
            cues={cues}
            composition={composition}
          />
        ) : null}
        {mediaError ? (
          <div className="absolute inset-x-0 top-0 flex items-center gap-2 bg-destructive/90 px-3 py-1.5 text-[12px] font-medium text-destructive-foreground">
            <IconAlertTriangle size={14} aria-hidden />
            The media file couldn't be loaded.
          </div>
        ) : null}
        {!playing && composition.durationMs > 0 ? (
          <button
            type="button"
            aria-label="Play"
            onClick={() => controller.play()}
            className="absolute left-1/2 top-1/2 flex size-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-stage-foreground/90 text-stage opacity-0 shadow-lg outline-none transition-[opacity,transform] duration-150 group-hover/stage:opacity-100 focus-visible:opacity-100 active:scale-95"
          >
            <IconPlayerPlayFilled
              size={22}
              className="translate-x-px"
              aria-hidden
            />
          </button>
        ) : null}
      </div>
      {note ? (
        <p className="text-center text-[12px] text-muted-foreground">{note}</p>
      ) : null}
    </div>
  );
}
