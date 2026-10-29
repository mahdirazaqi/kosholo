"use client";

import Link from "next/link";
import { useRef } from "react";
import { Check, ChevronRight, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { IosSwitch } from "@/components/settings/ios-switch";
import { IconTile, type TileColor } from "@/components/settings/icon-tile";
import { copyText, vibrate } from "@/lib/client-utils";
import { cn } from "@/lib/utils";

// The row variants of the settings lists. Every row is an <li>; `id` makes it a
// search/highlight target (data-setting). Rows with an icon tile are 48px high
// and their separator starts after the tile; plain rows are 44px.

type Base = {
  id?: string;
  label: string;
  icon?: LucideIcon;
  tile?: TileColor;
};

const ROW = "row-press no-press relative flex w-full items-center gap-3 ps-4 pe-4 text-start text-[17px]";

function Cell({
  id,
  tile,
  icon,
  className,
  children,
}: Pick<Base, "id" | "tile" | "icon"> & { className?: string; children: React.ReactNode }) {
  const withTile = Boolean(icon && tile);
  return (
    <li
      data-setting={id}
      style={withTile ? ({ "--sep-inset": "3.625rem" } as React.CSSProperties) : undefined}
      className={cn("row-sep relative bg-grouped-cell", className)}
    >
      {children}
    </li>
  );
}

const height = (tile?: TileColor, icon?: LucideIcon) => (tile && icon ? "min-h-12" : "min-h-11");

function Lead({ icon, tile }: Pick<Base, "icon" | "tile">) {
  return icon && tile ? <IconTile icon={icon} color={tile} /> : null;
}

// Navigation: tile + label + muted value + chevron (it points to the inline end).
export function NavRow({
  id, label, icon, tile, value, href, prefetch,
}: Base & { value?: React.ReactNode; href: string; prefetch?: boolean }) {
  return (
    <Cell id={id} icon={icon} tile={tile}>
      <Link href={href} prefetch={prefetch} className={cn(ROW, height(tile, icon))}>
        <Lead icon={icon} tile={tile} />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {value != null && <span className="max-w-[45%] shrink-0 truncate text-base text-muted-foreground">{value}</span>}
        <ChevronRight className="size-5 shrink-0 text-muted-foreground/70 rtl:rotate-180" />
      </Link>
    </Cell>
  );
}

// Same as NavRow, but runs an action (opens a sheet, installs, …).
export function ActionRow({
  id, label, icon, tile, value, onSelect, chevron = false, disabled,
}: Base & { value?: React.ReactNode; onSelect: () => void; chevron?: boolean; disabled?: boolean }) {
  return (
    <Cell id={id} icon={icon} tile={tile}>
      <button type="button" disabled={disabled} onClick={onSelect} className={cn(ROW, height(tile, icon), "disabled:opacity-50")}>
        <Lead icon={icon} tile={tile} />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {value != null && <span className="shrink-0 text-base text-muted-foreground">{value}</span>}
        {chevron && <ChevronRight className="size-5 shrink-0 text-muted-foreground/70 rtl:rotate-180" />}
      </button>
    </Cell>
  );
}

// Toggle: tile + label + iOS switch. The whole row toggles.
export function ToggleRow({
  id, label, icon, tile, checked, onCheckedChange, disabled,
}: Base & { checked: boolean; onCheckedChange: (checked: boolean) => void; disabled?: boolean }) {
  return (
    <Cell id={id} icon={icon} tile={tile}>
      <div
        onClick={() => {
          if (disabled) return;
          vibrate(10);
          onCheckedChange(!checked);
        }}
        className={cn(ROW, height(tile, icon), "cursor-pointer py-1.5")}
      >
        <Lead icon={icon} tile={tile} />
        <span className="min-w-0 flex-1">{label}</span>
        <IosSwitch checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} label={label} />
      </div>
    </Cell>
  );
}

// Label + muted value, no chevron. Long-press (or a click) copies the value.
export function ValueRow({
  id, label, value, copyable = false, dir,
}: { id?: string; label: string; value: string; copyable?: boolean; dir?: "ltr" }) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fired = useRef(false);

  async function copy() {
    try {
      await copyText(value);
      vibrate(10);
      toast.success("Copied");
    } catch {
      toast.error("Couldn't copy");
    }
  }

  const content = (
    <>
      <span className="shrink-0">{label}</span>
      <span dir={dir} className="min-w-0 flex-1 truncate text-end text-base text-muted-foreground">{value}</span>
    </>
  );
  return (
    <Cell id={id}>
      {copyable ? (
        <button
          type="button"
          onPointerDown={() => {
            fired.current = false;
            timer.current = setTimeout(() => {
              fired.current = true;
              void copy();
            }, 450);
          }}
          onPointerUp={() => timer.current && clearTimeout(timer.current)}
          onPointerLeave={() => timer.current && clearTimeout(timer.current)}
          onPointerCancel={() => timer.current && clearTimeout(timer.current)}
          onClick={() => {
            // A mouse click copies; on touch the long press already did.
            if (!fired.current) void copy();
          }}
          aria-label={`${label}: ${value}. Copy`}
          className={cn(ROW, "min-h-11")}
        >
          {content}
        </button>
      ) : (
        <div className={cn(ROW, "min-h-11")}>{content}</div>
      )}
    </Cell>
  );
}

// Single choice: a checkmark at the inline end when selected.
export function CheckRow({
  id, label, selected, onSelect, icon,
}: { id?: string; label: string; selected: boolean; onSelect: () => void; icon?: LucideIcon }) {
  const Icon = icon;
  return (
    <Cell id={id}>
      <button
        type="button"
        role="radio"
        aria-checked={selected}
        onClick={() => {
          vibrate(10);
          onSelect();
        }}
        className={cn(ROW, "min-h-11")}
      >
        {Icon && <Icon className="size-5 shrink-0 text-muted-foreground" />}
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {selected && <Check className="size-5 shrink-0 text-primary" strokeWidth={2.5} />}
      </button>
    </Cell>
  );
}

// Text in the link colour, centred or start-aligned.
export function ButtonRow({
  id, label, onSelect, align = "center", disabled, icon: Icon,
}: { id?: string; label: string; onSelect: () => void; align?: "center" | "start"; disabled?: boolean; icon?: LucideIcon }) {
  return (
    <Cell id={id}>
      <button
        type="button"
        disabled={disabled}
        onClick={onSelect}
        className={cn(ROW, "min-h-11 text-link disabled:opacity-50", align === "center" && "justify-center")}
      >
        {Icon && <Icon className="size-5 shrink-0" />}
        {label}
      </button>
    </Cell>
  );
}

// Red text, no icon (log out, clear cache, …).
export function DestructiveRow({
  id, label, onSelect, disabled, align = "center",
}: { id?: string; label: string; onSelect: () => void; disabled?: boolean; align?: "center" | "start" }) {
  return (
    <Cell id={id}>
      <button
        type="button"
        disabled={disabled}
        onClick={onSelect}
        className={cn(ROW, "min-h-11 text-destructive disabled:opacity-50", align === "center" && "justify-center")}
      >
        {label}
      </button>
    </Cell>
  );
}

// A row that holds any content (an inline text field, a slider, a grid).
export function CustomRow({ id, children, className }: { id?: string; children: React.ReactNode; className?: string }) {
  return (
    <Cell id={id} className={className}>
      {children}
    </Cell>
  );
}

// iOS inline field: label on the left, the input fills the rest of the cell.
export function FieldRow({
  id, label, error, ...props
}: { id?: string; label?: string; error?: boolean } & React.ComponentProps<"input">) {
  return (
    <Cell id={id}>
      <label className={cn("flex min-h-11 w-full items-center gap-3 ps-4 pe-4 text-[17px]")}>
        {label && <span className="w-28 shrink-0">{label}</span>}
        <input
          {...props}
          aria-invalid={error || undefined}
          className={cn(
            "min-h-11 min-w-0 flex-1 bg-transparent text-start text-base outline-none placeholder:text-muted-foreground/70",
            props.className,
          )}
        />
      </label>
    </Cell>
  );
}
