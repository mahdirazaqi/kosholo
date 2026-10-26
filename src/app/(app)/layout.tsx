import { RealtimeProvider } from "@/components/realtime-provider";

// Everything signed-in shares one socket connection.
export default function SignedInLayout({ children }: LayoutProps<"/">) {
  return <RealtimeProvider>{children}</RealtimeProvider>;
}
