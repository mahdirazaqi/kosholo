import { AppShell } from "@/components/app-shell";

// Top-level tabs: app shell with the bottom navigation.
export default function TabsLayout({ children }: LayoutProps<"/">) {
  return <AppShell nav>{children}</AppShell>;
}
