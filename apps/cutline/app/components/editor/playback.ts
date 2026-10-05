import {
  nextPlayableSrc,
  segmentEndAt,
  srcToOut,
  type Composition,
} from "@shared/transcript";
import { useEffect, useState, useSyncExternalStore } from "react";

type Listener = () => void;
type TickListener = (srcMs: number) => void;

const SPLICE_LOOKAHEAD_MS = 18;

/**
 * Plays only the kept ranges of the source media. Without a media element it
 * runs a preview clock so the script and timeline still play through the edit.
 */
export class PlaybackController {
  private media: HTMLMediaElement | null = null;
  private composition: Composition = { segments: [], durationMs: 0 };
  private srcMs = 0;
  private playing = false;
  private raf = 0;
  private lastFrame = 0;
  private stateListeners = new Set<Listener>();
  private tickListeners = new Set<TickListener>();
  private snapshot = { playing: false, hasMedia: false };

  getSnapshot = () => this.snapshot;

  subscribe = (listener: Listener) => {
    this.stateListeners.add(listener);
    return () => {
      this.stateListeners.delete(listener);
    };
  };

  onTick(listener: TickListener) {
    this.tickListeners.add(listener);
    listener(this.srcMs);
    return () => {
      this.tickListeners.delete(listener);
    };
  }

  get time() {
    return this.srcMs;
  }

  get outTime() {
    return srcToOut(this.composition, this.srcMs);
  }

  get editedDuration() {
    return this.composition.durationMs;
  }

  getComposition() {
    return this.composition;
  }

  attachMedia(media: HTMLMediaElement | null) {
    if (this.media === media) return;
    if (this.media) {
      this.media.removeEventListener("pause", this.handleMediaPause);
      this.media.removeEventListener("ended", this.handleMediaPause);
    }
    this.media = media;
    if (media) {
      media.addEventListener("pause", this.handleMediaPause);
      media.addEventListener("ended", this.handleMediaPause);
      if (Math.abs(media.currentTime * 1000 - this.srcMs) > 30) {
        media.currentTime = this.srcMs / 1000;
      }
    }
    this.setPlaying(false);
    this.emitState();
  }

  setComposition(composition: Composition) {
    this.composition = composition;
    this.emitTick();
  }

  play() {
    if (this.composition.segments.length === 0) return;
    let target = nextPlayableSrc(this.composition, this.srcMs);
    const last =
      this.composition.segments[this.composition.segments.length - 1];
    if (target === null || this.srcMs >= last.srcEnd - 5) {
      target = this.composition.segments[0].srcStart;
    }
    this.seekSrc(target);
    if (this.media) {
      void this.media.play().catch(() => this.setPlaying(false));
    }
    this.lastFrame = performance.now();
    this.setPlaying(true);
    this.loop();
  }

  pause() {
    this.media?.pause();
    this.setPlaying(false);
  }

  toggle() {
    if (this.playing) this.pause();
    else this.play();
  }

  seekSrc(srcMs: number) {
    this.srcMs = Math.max(0, srcMs);
    if (
      this.media &&
      Math.abs(this.media.currentTime * 1000 - this.srcMs) > 5
    ) {
      this.media.currentTime = this.srcMs / 1000;
    }
    this.emitTick();
  }

  seekOut(outMs: number) {
    const { segments } = this.composition;
    if (segments.length === 0) return;
    const clamped = Math.max(0, Math.min(outMs, this.composition.durationMs));
    let seg = segments[0];
    for (const candidate of segments) {
      if (candidate.outStart <= clamped) seg = candidate;
      else break;
    }
    this.seekSrc(
      Math.min(seg.srcEnd - 1, seg.srcStart + (clamped - seg.outStart)),
    );
  }

  skip(deltaOutMs: number) {
    this.seekOut(this.outTime + deltaOutMs);
  }

  private handleMediaPause = () => {
    if (this.playing && this.media?.ended) this.setPlaying(false);
    else if (this.playing && this.media?.paused) this.setPlaying(false);
  };

  private loop = () => {
    cancelAnimationFrame(this.raf);
    if (!this.playing) return;
    const now = performance.now();
    const dt = Math.min(250, now - this.lastFrame);
    this.lastFrame = now;
    let t = this.media ? this.media.currentTime * 1000 : this.srcMs + dt;
    const end = segmentEndAt(this.composition, t);
    if (end !== null && end - t <= SPLICE_LOOKAHEAD_MS) {
      t = end;
    }
    const next = nextPlayableSrc(this.composition, t);
    if (next === null) {
      const last =
        this.composition.segments[this.composition.segments.length - 1];
      this.srcMs = last ? last.srcEnd : t;
      this.media?.pause();
      this.setPlaying(false);
      this.emitTick();
      return;
    }
    if (next !== t && this.media) this.media.currentTime = next / 1000;
    this.srcMs = next;
    this.emitTick();
    this.raf = requestAnimationFrame(this.loop);
  };

  private setPlaying(playing: boolean) {
    if (this.playing === playing) return;
    this.playing = playing;
    if (!playing) cancelAnimationFrame(this.raf);
    this.emitState();
  }

  private emitState() {
    this.snapshot = { playing: this.playing, hasMedia: this.media !== null };
    for (const listener of this.stateListeners) listener();
  }

  private emitTick() {
    for (const listener of this.tickListeners) listener(this.srcMs);
  }
}

export function usePlaybackController() {
  const [controller] = useState(() => new PlaybackController());
  useEffect(() => () => controller.pause(), [controller]);
  return controller;
}

export function usePlaybackState(controller: PlaybackController) {
  return useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
}

/** Re-render with the source time, coalesced to one update per frame. */
export function usePlaybackTime(controller: PlaybackController) {
  const [time, setTime] = useState(controller.time);
  useEffect(() => {
    let frame = 0;
    let pending = controller.time;
    const unsubscribe = controller.onTick((ms) => {
      pending = ms;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        setTime(pending);
      });
    });
    return () => {
      unsubscribe();
      cancelAnimationFrame(frame);
    };
  }, [controller]);
  return time;
}
