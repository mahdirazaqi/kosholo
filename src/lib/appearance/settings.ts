// The appearance model and its defaults. Client-safe and zod-free: it is imported
// by the boot script generator, the runtime store and the Server Action.

export const THEME_IDS = ["firoozeh", "lajvard", "anar", "zafaran", "peste", "yas"] as const;
export type ThemeId = (typeof THEME_IDS)[number];

export const WALLPAPER_IDS = ["none", "gradient", "girih", "eslimi", "doodle", "dots", "waves", "night"] as const;
export type WallpaperId = (typeof WALLPAPER_IDS)[number];

export const TEXT_SIZES = [
  { step: 1, label: "Small", px: 14 },
  { step: 2, label: "Medium", px: 16 },
  { step: 3, label: "Large", px: 18 },
  { step: 4, label: "Extra large", px: 20 },
] as const;
export type TextSize = 1 | 2 | 3 | 4;

// Saved on the account. The display mode (system/light/dark) is per device and
// owned by next-themes, so it is not part of this.
export type Appearance = { theme: ThemeId; wallpaper: WallpaperId; textSize: TextSize };

export const DEFAULT_APPEARANCE: Appearance = { theme: "firoozeh", wallpaper: "girih", textSize: 2 };

export const APPEARANCE_KEY = "kosholo:appearance";
export const APPEARANCE_PENDING_KEY = "kosholo:appearance-pending";

// Unknown ids and bad values fall back to the default for that field.
export function normalizeAppearance(input: unknown): Appearance {
  const value = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const size = Number(value.textSize);
  return {
    theme: (THEME_IDS as readonly unknown[]).includes(value.theme) ? (value.theme as ThemeId) : DEFAULT_APPEARANCE.theme,
    wallpaper: (WALLPAPER_IDS as readonly unknown[]).includes(value.wallpaper)
      ? (value.wallpaper as WallpaperId)
      : DEFAULT_APPEARANCE.wallpaper,
    textSize: size === 1 || size === 2 || size === 3 || size === 4 ? size : DEFAULT_APPEARANCE.textSize,
  };
}

export const sameAppearance = (a: Appearance, b: Appearance) =>
  a.theme === b.theme && a.wallpaper === b.wallpaper && a.textSize === b.textSize;
