import {
  Bell, BadgeInfo, Bookmark, Database, Download, Eraser, Info, KeyRound, Lock, Mail, Moon, Paintbrush, RotateCcw, Smartphone,
  Type, User, UserRound, Vibrate, Image as ImageIcon, LogOut, Camera, AtSign, Palette,
  type LucideIcon,
} from "lucide-react";
import type { TileColor } from "@/components/settings/icon-tile";
import { squash } from "./normalize";

// The static index of every setting, for the search on the settings root.
// RULE: every new setting must be added here (and to its page).
// `keywords` are extra English and Persian words and synonyms; `id` is the
// data-setting id of the row to highlight on its page.
export type SettingEntry = {
  id: string;
  title: string;
  path: string[]; // breadcrumb above the title, e.g. ["Notifications & Sounds"]
  href: string;
  icon: LucideIcon;
  tile: TileColor;
  keywords: string[];
};

export const SETTINGS_INDEX: SettingEntry[] = [
  { id: "saved", title: "Saved Messages", path: [], href: "/saved", icon: Bookmark, tile: "blue", keywords: ["bookmark", "notes", "پیام های ذخیره شده", "ذخیره", "یادداشت"] },

  { id: "notifications", title: "Notifications & Sounds", path: [], href: "/settings/notifications", icon: Bell, tile: "red", keywords: ["alerts", "اعلان", "اعلان ها", "صدا", "نوتیفیکیشن"] },
  { id: "sound", title: "New message sound", path: ["Notifications & Sounds"], href: "/settings/notifications", icon: Bell, tile: "red", keywords: ["chime", "ringtone", "mute", "صدای پیام", "صدا", "زنگ"] },
  { id: "haptics", title: "Vibration", path: ["Notifications & Sounds"], href: "/settings/notifications", icon: Vibrate, tile: "red", keywords: ["haptic", "haptics", "feedback", "لرزش", "ویبره"] },
  { id: "app-badge", title: "Show unread count on the app icon", path: ["Notifications & Sounds"], href: "/settings/notifications", icon: BadgeInfo, tile: "red", keywords: ["badge", "icon", "unread", "نشانگر", "آیکون", "تعداد"] },

  { id: "privacy", title: "Privacy & Security", path: [], href: "/settings/privacy", icon: Lock, tile: "gray", keywords: ["security", "account", "حریم خصوصی", "امنیت", "حساب"] },
  { id: "password", title: "Change password", path: ["Privacy & Security"], href: "/settings/privacy/password", icon: KeyRound, tile: "orange", keywords: ["passcode", "pass", "رمز", "رمز عبور", "پسورد", "گذرواژه"] },
  { id: "logout", title: "Log out", path: ["Privacy & Security"], href: "/settings/privacy", icon: LogOut, tile: "red", keywords: ["sign out", "exit", "خروج", "خروج از حساب"] },

  { id: "storage", title: "Data & Storage", path: [], href: "/settings/storage", icon: Database, tile: "green", keywords: ["space", "disk", "داده", "حافظه", "فضا", "ذخیره سازی"] },
  { id: "clear-cache", title: "Clear cache", path: ["Data & Storage"], href: "/settings/storage", icon: Eraser, tile: "green", keywords: ["cache", "memory", "delete", "پاک کردن", "کش", "حافظه پنهان", "حافظه"] },

  { id: "appearance", title: "Appearance", path: [], href: "/settings/appearance", icon: Paintbrush, tile: "teal", keywords: ["look", "ظاهر", "نمایش"] },
  { id: "mode", title: "Display mode", path: ["Appearance"], href: "/settings/appearance", icon: Moon, tile: "teal", keywords: ["dark", "light", "night", "system", "dark mode", "دارک", "تیره", "روشن", "شب", "حالت", "سیستم"] },
  { id: "theme", title: "Color theme", path: ["Appearance"], href: "/settings/appearance", icon: Palette, tile: "teal", keywords: ["color", "colour", "accent", "تم", "رنگ", "فیروزه", "لاجورد", "انار", "زعفران", "پسته", "یاس"] },
  { id: "wallpaper", title: "Chat wallpaper", path: ["Appearance"], href: "/settings/appearance", icon: ImageIcon, tile: "teal", keywords: ["background", "pattern", "پس زمینه", "والپیپر", "کاشی", "اسلیمی", "نسیم"] },
  { id: "text-size", title: "Message text size", path: ["Appearance"], href: "/settings/appearance", icon: Type, tile: "teal", keywords: ["font", "bigger", "larger", "smaller", "اندازه متن", "فونت", "نوشته", "بزرگ", "کوچک"] },
  { id: "reset-appearance", title: "Reset to defaults", path: ["Appearance"], href: "/settings/appearance", icon: RotateCcw, tile: "teal", keywords: ["default", "بازگشت به پیش فرض", "پیش فرض"] },

  { id: "profile", title: "Edit profile", path: [], href: "/settings/profile", icon: UserRound, tile: "blue", keywords: ["account", "ویرایش", "پروفایل", "حساب"] },
  { id: "photo", title: "Set profile photo", path: ["Edit profile"], href: "/settings/profile", icon: Camera, tile: "blue", keywords: ["avatar", "picture", "image", "عکس", "تصویر", "آواتار"] },
  { id: "name", title: "Name", path: ["Edit profile"], href: "/settings/profile", icon: User, tile: "blue", keywords: ["display name", "نام", "اسم"] },
  { id: "username", title: "Username", path: ["Edit profile"], href: "/settings/profile", icon: AtSign, tile: "blue", keywords: ["handle", "نام کاربری"] },
  { id: "email", title: "Email", path: ["Edit profile"], href: "/settings/profile", icon: Mail, tile: "blue", keywords: ["mail", "ایمیل", "پست الکترونیک"] },

  { id: "install", title: "Install app", path: [], href: "/settings", icon: Download, tile: "purple", keywords: ["pwa", "home screen", "add to home", "نصب", "نصب اپ", "صفحه اصلی"] },
  { id: "about", title: "About", path: [], href: "/settings/about", icon: Info, tile: "gray", keywords: ["version", "درباره", "نسخه"] },
  { id: "version", title: "Version", path: ["About"], href: "/settings/about", icon: Smartphone, tile: "gray", keywords: ["build", "release", "نسخه"] },
];

const prepared = SETTINGS_INDEX.map((entry) => ({
  entry,
  title: squash(entry.title),
  rest: squash([...entry.path, ...entry.keywords].join(" ")),
}));

// Every word of the query must appear (as a substring) in the entry's title,
// breadcrumb or keywords. Title hits rank first.
export function searchSettings(query: string): SettingEntry[] {
  const words = query.trim().split(/\s+/).map(squash).filter(Boolean);
  if (words.length === 0) return [];
  return prepared
    .map((item) => {
      const hay = `${item.title} ${item.rest}`;
      if (!words.every((word) => hay.includes(word))) return null;
      const inTitle = words.every((word) => item.title.includes(word));
      return { entry: item.entry, score: inTitle ? 0 : 1 };
    })
    .filter((hit): hit is { entry: SettingEntry; score: number } => hit !== null)
    .sort((a, b) => a.score - b.score)
    .map((hit) => hit.entry);
}
