"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TimezoneSelect } from "@/components/timezone-select";
import {
  saveWorkingHoursAction,
  type WorkingHoursDayInput,
} from "@/app/dashboard/(main)/settings/actions";
import { canonicalizeTimezone } from "@/lib/timezones";

const DAY_KEYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const satisfies readonly WorkingHoursDayInput["day"][];

type Props = {
  workspaceId: string;
  initialDays: WorkingHoursDayInput[];
  /** Cal schedule timezone when present; otherwise workspace timezone. */
  initialTimeZone: string;
};

export function WorkingHoursCard({
  workspaceId,
  initialDays,
  initialTimeZone,
}: Props) {
  const t = useTranslations("dashboard.workingHours");
  const [days, setDays] = useState(initialDays);
  const [timeZone, setTimeZone] = useState(() =>
    canonicalizeTimezone(initialTimeZone),
  );
  const [pending, startTransition] = useTransition();

  const update = (
    key: WorkingHoursDayInput["day"],
    patch: Partial<WorkingHoursDayInput>,
  ) => {
    setDays((prev) => prev.map((d) => (d.day === key ? { ...d, ...patch } : d)));
  };

  const handleSave = () => {
    startTransition(async () => {
      const result = await saveWorkingHoursAction(workspaceId, {
        days,
        timeZone,
      });
      if (result.ok) toast.success(t("saved"));
      else toast.error(result.error);
    });
  };

  return (
    <div className="rounded-2xl border border-border/80 bg-card/50 p-5 sm:p-6">
      <div className="space-y-4">
        <div>
          <p className="font-medium text-foreground">{t("title")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>
        </div>

        <div className="max-w-md space-y-2">
          <Label htmlFor="working-hours-timezone">{t("timezone")}</Label>
          <TimezoneSelect
            id="working-hours-timezone"
            name="working_hours_timezone"
            value={timeZone}
            onValueChange={setTimeZone}
          />
          <p className="text-muted-foreground text-xs leading-relaxed">
            {t("timezoneHint")}
          </p>
        </div>

        {DAY_KEYS.map((key) => {
          const day = days.find((d) => d.day === key)!;
          return (
            <div key={key} className="flex items-center gap-3">
              <label className="flex w-32 shrink-0 items-center gap-2 text-sm">
                <input
                  checked={day.enabled}
                  type="checkbox"
                  onChange={(e) => update(key, { enabled: e.target.checked })}
                />
                {t(`days.${key}`)}
              </label>
              <Input
                className="w-28"
                disabled={!day.enabled}
                type="time"
                value={day.startTime}
                onChange={(e) => update(key, { startTime: e.target.value })}
              />
              <span className="text-muted-foreground text-sm">–</span>
              <Input
                className="w-28"
                disabled={!day.enabled}
                type="time"
                value={day.endTime}
                onChange={(e) => update(key, { endTime: e.target.value })}
              />
            </div>
          );
        })}
        <Button disabled={pending} onClick={handleSave}>
          {pending ? t("saving") : t("save")}
        </Button>
      </div>
    </div>
  );
}
