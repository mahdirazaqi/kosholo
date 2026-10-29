import { SettingsPage } from "@/components/settings/settings-page";
import { SettingsSection } from "@/components/settings/settings-section";
import { ValueRow } from "@/components/settings/settings-row";

export function AboutSettings({ version }: { version: string }) {
  return (
    <SettingsPage title="About" backLabel="Settings" largeTitle={false}>
      <div className="flex flex-col items-center gap-2 pt-4 pb-7 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img draggable={false} src="/logo.svg" alt="" width={88} height={88} className="rounded-[22px]" />
        <h2 className="text-[22px] font-bold">Kosholo</h2>
        <p className="max-w-xs text-[15px] leading-6 text-muted-foreground">
          A light, fast messenger for chats, groups and channels that works offline and installs like an app.
        </p>
      </div>
      <SettingsSection>
        <ValueRow id="version" label="Version" value={version} copyable />
      </SettingsSection>
    </SettingsPage>
  );
}
