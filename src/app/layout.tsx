import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { AppearanceWatcher } from "@/components/appearance/appearance-watcher";
import { NativeBehaviors } from "@/components/native-behaviors";
import { ServiceWorkerRegistration } from "@/components/pwa/service-worker";
import { ThemeProvider } from "@/components/theme-provider";
import { bootScript } from "@/lib/appearance/boot";
import { themeColorHex, themesCss } from "@/lib/appearance/themes";
import { wallpapersCss } from "@/lib/appearance/wallpapers";
import { DirectionProvider } from "@/components/ui/direction";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";
import "./native.css";
import "./appearance.css";

// UI text uses the system font. Vazirmatn only covers Arabic-script characters
// (Persian/Arabic messages and names), so the browser downloads it only when
// such text is on screen.
const vazirmatn = localFont({
  src: "./fonts/Vazirmatn-Variable.woff2",
  variable: "--font-vazirmatn",
  weight: "100 900",
  display: "swap",
  preload: false,
  declarations: [
    { prop: "unicode-range", value: "U+0600-06FF, U+0750-077F, U+08A0-08FF, U+200C-200F, U+FB50-FDFF, U+FE70-FEFF" },
  ],
});

const APP_NAME = "Kosholo";

export const metadata: Metadata = {
  title: APP_NAME,
  description: "A light, fast messenger",
  applicationName: APP_NAME,
  // Installed app (iOS): full screen, content under a translucent status bar
  // (safe-area insets keep the UI clear of the notch).
  appleWebApp: { capable: true, title: APP_NAME, statusBarStyle: "black-translucent" },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "48x48" },
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/logo.svg", type: "image/svg+xml" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  other: {
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // No pinch/double-tap zoom (the image viewer and maps zoom on their own).
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  // Android/Chrome shrink the layout when the keyboard opens, so the chat
  // composer stays visible. iOS is handled by useVisualViewportHeight().
  interactiveWidget: "resizes-content",
};

// Theme colours and wallpapers are generated from src/lib/appearance and inlined, so
// they work offline and never wait for a stylesheet. The boot script sets
// data-theme / data-wallpaper / data-text-size and the theme-color meta before the
// first paint (see lib/appearance/boot.ts).
const APPEARANCE_CSS = `${themesCss()}\n${wallpapersCss()}`;
const BOOT_SCRIPT = bootScript();

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      dir="ltr"
      className={`${vazirmatn.variable} antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Not the viewport's themeColor: the colour follows the chosen theme and mode, so it is set (and kept in step) by script. */}
        <meta name="theme-color" content={themeColorHex("firoozeh", "light")} suppressHydrationWarning />
        <style dangerouslySetInnerHTML={{ __html: APPEARANCE_CSS }} />
        <script dangerouslySetInnerHTML={{ __html: BOOT_SCRIPT }} />
      </head>
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <DirectionProvider dir="ltr">
            {/* Pages outside AppShell scroll here, never on the body. */}
            <div id="root-scroll">{children}</div>
            <NativeBehaviors />
            <AppearanceWatcher />
            <Toaster position="top-center" />
            <ServiceWorkerRegistration />
          </DirectionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
