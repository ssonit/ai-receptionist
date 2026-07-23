import Link from "next/link";
import { IconAlertTriangle, IconCircleCheck, IconInfoCircle } from "@tabler/icons-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { AiHealthAlert, ToolErrorRow } from "@/lib/analytics";
import { getLeadStatusLabel, LEAD_STATUSES } from "@/lib/lead-status";
import { cn } from "@/lib/utils";

function severityIcon(severity: AiHealthAlert["severity"]) {
  if (severity === "error") return IconAlertTriangle;
  if (severity === "warning") return IconAlertTriangle;
  return IconInfoCircle;
}

function severityClass(severity: AiHealthAlert["severity"]) {
  if (severity === "error") {
    return "border-destructive/40 bg-destructive/10 text-destructive";
  }
  if (severity === "warning") {
    return "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300";
  }
  return "border-border bg-muted/40 text-muted-foreground";
}

export function AiHealthPanel({
  alerts,
  toolErrors,
  funnel,
}: {
  alerts: AiHealthAlert[];
  toolErrors: ToolErrorRow[];
  funnel: Record<string, number> & { total: number };
}) {
  const hasBlocking = alerts.some((a) => a.severity === "error" && a.id !== "healthy");

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            AI health
            {hasBlocking ? (
              <Badge variant="destructive">Cần xử lý</Badge>
            ) : (
              <Badge
                variant="outline"
                className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
              >
                <IconCircleCheck className="size-3.5" />
                OK
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            Cấu hình agent + lỗi tool gần đây. Không thay thế log đầy đủ của Eve
            runtime.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {alerts.map((alert) => {
            const Icon = severityIcon(alert.severity);
            return (
              <div
                key={alert.id}
                className={cn(
                  "rounded-lg border px-3 py-3 text-sm",
                  severityClass(alert.severity),
                )}
              >
                <div className="flex items-start gap-2">
                  <Icon className="mt-0.5 size-4 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-foreground">{alert.title}</p>
                    <p className="mt-0.5 text-muted-foreground">{alert.detail}</p>
                    {alert.href ? (
                      <Link
                        className="mt-2 inline-block underline underline-offset-4"
                        href={alert.href}
                      >
                        Mở trang liên quan
                      </Link>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Lead funnel</CardTitle>
            <CardDescription>Phân bố status trong khoảng đang xem.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {LEAD_STATUSES.map((status) => {
              const count = funnel[status] ?? 0;
              const pct =
                funnel.total > 0 ? Math.round((count / funnel.total) * 100) : 0;
              return (
                <div key={status} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span>{getLeadStatusLabel(status)}</span>
                    <span className="text-muted-foreground tabular-nums">
                      {count} · {pct}%
                    </span>
                  </div>
                  <div className="bg-muted h-1.5 overflow-hidden rounded-full">
                    <div
                      className="bg-primary h-full rounded-full"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Lỗi tool (24h)</CardTitle>
            <CardDescription>
              Từ `agent_tool_events` — check_availability / book_appointment /
              log_lead.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {toolErrors.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Không có lỗi tool trong 24 giờ qua.
              </p>
            ) : (
              <ul className="divide-y rounded-lg border">
                {toolErrors.map((row) => (
                  <li key={row.id} className="px-3 py-2.5 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="font-mono text-[10px]">
                        {row.tool_name}
                      </Badge>
                      <span className="text-muted-foreground text-xs">
                        {new Date(row.created_at).toLocaleString("vi-VN", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </span>
                    </div>
                    <p className="mt-1 break-words text-destructive">
                      {row.error || "Unknown error"}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
