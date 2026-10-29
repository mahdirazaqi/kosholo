import { z } from "zod";
import { DEFAULT_APPEARANCE, THEME_IDS, WALLPAPER_IDS } from "@/lib/appearance/settings";

// Unknown ids and bad values fall back to the default for that field, so an
// older or tampered client can never store something the UI can't render.
export const appearanceSchema = z.object({
  theme: z.enum(THEME_IDS).catch(DEFAULT_APPEARANCE.theme),
  wallpaper: z.enum(WALLPAPER_IDS).catch(DEFAULT_APPEARANCE.wallpaper),
  textSize: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).catch(DEFAULT_APPEARANCE.textSize),
});
