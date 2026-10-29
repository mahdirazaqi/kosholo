import { AppShell } from "@/components/app-shell";

// Settings sub-pages: full-height, no bottom navigation, edge-swipe back on phones.
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return <AppShell swipeBack>{children}</AppShell>;
}
