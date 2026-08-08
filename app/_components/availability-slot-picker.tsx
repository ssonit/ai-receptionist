"use client";

import { ClockIcon } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import {
  buildSlotPickerModel,
  formatSlotTimeLabel,
  type AvailabilitySlotRow,
  type SlotPeriod,
} from "@/lib/availability-slot-ui";
import { cn } from "@/lib/utils";

export type AvailabilitySlotSelection = {
  start: string;
  display: string;
};

export function AvailabilitySlotPicker({
  canSelect,
  locale,
  onSelect,
  output,
}: {
  readonly canSelect: boolean;
  readonly locale?: string;
  readonly onSelect?: (slot: AvailabilitySlotSelection) => void;
  readonly output: unknown;
}) {
  const t = useTranslations("chat.slots");
  const [selectedStart, setSelectedStart] = useState<string | null>(null);
  const model = buildSlotPickerModel(output, { locale });

  if (!model) return null;

  const periodLabel = (period: SlotPeriod) => {
    switch (period) {
      case "morning":
        return t("morning");
      case "afternoon":
        return t("afternoon");
      case "evening":
        return t("evening");
    }
  };

  const handleSelect = (slot: AvailabilitySlotRow) => {
    if (!canSelect || !onSelect) return;
    setSelectedStart(slot.start);
    onSelect({ start: slot.start, display: slot.display });
  };

  return (
    <div className="mt-3 space-y-4">
      {model.days.map((day) => (
        <div className="space-y-2.5" key={day.day}>
          <p className="text-xs font-medium text-zinc-300">{day.dayLabel}</p>
          {day.periods.map((group) => (
            <div className="space-y-1.5" key={`${day.day}-${group.period}`}>
              <p className="text-[11px] font-medium tracking-wide text-zinc-500 uppercase">
                {periodLabel(group.period)}
              </p>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                {group.slots.map((slot) => {
                  const selected = selectedStart === slot.start;
                  const label = formatSlotTimeLabel(
                    slot.start,
                    model.businessTimeZone,
                    locale,
                  );
                  return (
                    <button
                      aria-pressed={selected}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-left text-[11px] transition",
                        selected
                          ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-300"
                          : "border-white/10 bg-white/3 text-zinc-300 hover:border-white/20 hover:bg-white/6",
                        (!canSelect || !onSelect) &&
                          "cursor-not-allowed opacity-50 hover:border-white/10 hover:bg-white/3",
                      )}
                      disabled={!canSelect || !onSelect}
                      key={slot.start}
                      onClick={() => handleSelect(slot)}
                      type="button"
                    >
                      <ClockIcon className="size-3 shrink-0 opacity-70" />
                      <span className="truncate">{label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {day.hiddenCount > 0 ? (
            <p className="text-[11px] text-zinc-500">
              {t("moreOnDay", { count: day.hiddenCount })}
            </p>
          ) : null}
        </div>
      ))}
      {model.truncated || model.otherDaysWithSlots > 0 ? (
        <p className="text-[11px] text-zinc-500">
          {model.otherDaysWithSlots > 0
            ? t("moreDays", { count: model.otherDaysWithSlots })
            : t("truncated")}
        </p>
      ) : null}
    </div>
  );
}
