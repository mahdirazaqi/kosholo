"use client";

import { KeyRound } from "lucide-react";
import { LogoutRow } from "@/components/settings/logout-row";
import { SettingsPage } from "@/components/settings/settings-page";
import { SettingsSection } from "@/components/settings/settings-section";
import { NavRow } from "@/components/settings/settings-row";

export function PrivacySettings() {
  return (
    <SettingsPage title="Privacy & Security" backLabel="Settings">
      <SettingsSection header="Security">
        <NavRow id="password" label="Change password" icon={KeyRound} tile="orange" href="/settings/privacy/password" />
      </SettingsSection>
      <SettingsSection header="Account" className="mt-7">
        <LogoutRow />
      </SettingsSection>
    </SettingsPage>
  );
}
