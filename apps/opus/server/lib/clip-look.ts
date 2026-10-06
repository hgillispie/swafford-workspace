export const ASPECTS = ["9:16", "1:1", "16:9"] as const;
export const CAPTION_STYLES = ["karaoke", "bold", "minimal", "phrase"] as const;
export const CAPTION_FONTS = ["dejavu", "liberation", "noto"] as const;
export const CAPTION_POSITIONS = ["bottom", "middle", "top"] as const;

export type Aspect = (typeof ASPECTS)[number];
export type CaptionStyle = (typeof CAPTION_STYLES)[number];
export type CaptionFont = (typeof CAPTION_FONTS)[number];
export type CaptionPosition = (typeof CAPTION_POSITIONS)[number];

export function clipLook(project: {
  aspect?: string | null;
  captionStyle?: string | null;
  captionFont?: string | null;
  captionPosition?: string | null;
  hookOverlay?: number | null;
}) {
  return {
    aspect: project.aspect || "9:16",
    captionStyle: project.captionStyle || "karaoke",
    captionFont: project.captionFont || "dejavu",
    captionPosition: project.captionPosition || "bottom",
    hookOverlay: project.hookOverlay === 0 ? 0 : 1,
  };
}
