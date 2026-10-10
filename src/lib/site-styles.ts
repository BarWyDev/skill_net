// Class strings shared by the graphite pages (landing, map, auth). Colours come from `.site` in global.css.
import { cn } from "@/lib/utils";

// At least 44 px tall, so every link and button is easy to tap on a phone (QA-001).
export const NAV_LINK =
  "inline-flex min-h-11 items-center text-ash underline-offset-4 hover:text-chalk hover:underline";
// Pair with `btn-primary` or `btn-secondary`.
export const BUTTON = "inline-flex min-h-12 items-center justify-center px-6 font-bold";
// A link inside running text: chalk, bold and always underlined.
export const TEXT_LINK = cn(NAV_LINK, "text-chalk font-bold underline");
