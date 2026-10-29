"use client";

import { useState } from "react";
import { logout } from "@/app/(auth)/actions";
import { ActionSheet } from "@/components/settings/action-sheet";
import { DestructiveRow } from "@/components/settings/settings-row";
import { clearAppearance } from "@/lib/appearance/runtime";
import { guardOnline } from "@/lib/client-utils";
import { clearBadges } from "@/lib/pwa/badges";
import { clearAppCaches } from "@/lib/pwa/caches";

// "Log out" with an iOS action sheet. Online only (the session cookie is cleared
// by the server). Nothing from this account stays on the device.
export function LogoutRow() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <DestructiveRow id="logout" label="Log out" onSelect={() => guardOnline() && setOpen(true)} />
      <ActionSheet
        open={open}
        onOpenChange={setOpen}
        title="Log out of your account?"
        description="You'll need to sign in again to see your chats."
        actions={[
          {
            label: "Log out",
            destructive: true,
            onSelect: async () => {
              if (!guardOnline()) return;
              clearBadges();
              clearAppearance();
              await clearAppCaches();
              await logout();
            },
          },
        ]}
      />
    </>
  );
}
