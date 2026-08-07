"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  saveWorkingHoursAction,
  type WorkingHoursDayInput,
} from "@/app/dashboard/settings/actions";

const DAYS: { key: WorkingHoursDayInput["day"]; label: string }[] = [
  { key: "Monday", label: "Thứ 2" },
  { key: "Tuesday", label: "Thứ 3" },
  { key: "Wednesday", label: "Thứ 4" },
  { key: "Thursday", label: "Thứ 5" },
  { key: "Friday", label: "Thứ 6" },
  { key: "Saturday", label: "Thứ 7" },
  { key: "Sunday", label: "Chủ nhật" },
];

type Props = {
  workspaceId: string;
  initialDays: WorkingHoursDayInput[];
};

export function WorkingHoursCard({ workspaceId, initialDays }: Props) {
  const [days, setDays] = useState(initialDays);
  const [pending, startTransition] = useTransition();

  const update = (
    key: WorkingHoursDayInput["day"],
    patch: Partial<WorkingHoursDayInput>,
  ) => {
    setDays((prev) => prev.map((d) => (d.day === key ? { ...d, ...patch } : d)));
  };

  const handleSave = () => {
    startTransition(async () => {
      const result = await saveWorkingHoursAction(workspaceId, { days });
      if (result.ok) toast.success("Đã lưu giờ làm việc.");
      else toast.error(result.error);
    });
  };

  return (
    <div className="rounded-2xl border border-border/80 bg-card/50 p-5 sm:p-6">
      <div className="space-y-4">
        <div>
          <p className="font-medium text-foreground">Giờ làm việc</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Đồng bộ trực tiếp với lịch mặc định trên Cal.com — không cần vào
            Cal.com để sửa.
          </p>
        </div>
        {DAYS.map(({ key, label }) => {
          const day = days.find((d) => d.day === key)!;
          return (
            <div key={key} className="flex items-center gap-3">
              <label className="flex w-32 shrink-0 items-center gap-2 text-sm">
                <input
                  checked={day.enabled}
                  type="checkbox"
                  onChange={(e) => update(key, { enabled: e.target.checked })}
                />
                {label}
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
          {pending ? "Đang lưu…" : "Lưu giờ làm việc"}
        </Button>
      </div>
    </div>
  );
}
