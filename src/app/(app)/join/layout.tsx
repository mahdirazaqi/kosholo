import { AppShell } from "@/components/app-shell";

// Invite links: a full-height screen without the bottom navigation.
export default function JoinLayout({ children }: LayoutProps<"/join">) {
  return <AppShell>{children}</AppShell>;
}
