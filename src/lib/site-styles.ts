// Class strings shared by every graphite page. Colours come from `.site` in global.css.
import { cn } from "@/lib/utils";

// At least 44 px tall, so every link and button is easy to tap on a phone (QA-001).
export const NAV_LINK =
  "inline-flex min-h-11 items-center text-ash underline-offset-4 hover:text-chalk hover:underline";
// Pair with `btn-primary` or `btn-secondary`.
export const BUTTON = "inline-flex min-h-12 items-center justify-center px-6 font-bold";
// A link inside a sentence: chalk, bold and always underlined, flowing with the text.
export const INLINE_LINK = "text-chalk font-bold underline underline-offset-4";
// A link that stands on its own line: INLINE_LINK with the 44 px tap target.
export const TEXT_LINK = cn(NAV_LINK, INLINE_LINK);

// The display h1 of every page but the landing, and the heading of a page section.
export const PAGE_TITLE = "font-display text-[clamp(2.75rem,10vw,6.5rem)] leading-[0.9] break-words";
export const SECTION_TITLE = "font-display text-[2rem] leading-none";

/**
 * The status vocabulary: a square from the map-grid motif plus text, so colour is never the only
 * signal. done (active, available, complete): a filled signal square. attention (stale, no phone,
 * incomplete): an empty signal square. neutral (ended, not available): an empty ash square. Errors use
 * the alarm icon instead (StatusLine, StatusMark). Every text tone passes AA on graphite.
 */
export type StatusTone = "done" | "attention" | "neutral" | "error";
export const STATUS_TEXT: Record<StatusTone, string> = {
  done: "text-chalk",
  attention: "text-signal",
  neutral: "text-ash",
  error: "text-alarm",
};
export const STATUS_SQUARE: Record<Exclude<StatusTone, "error">, string> = {
  done: "bg-signal",
  attention: "border-signal border-2",
  neutral: "border-ash border-2",
};
