import { AppShell } from "@/components/app-shell";

// Conversation screens are full-height, without the bottom navigation.
export default function ChatsLayout({ children }: LayoutProps<"/chats">) {
  return <AppShell swipeBack>{children}</AppShell>;
}
