"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useTransition } from "react";
import Link from "next/link";
import { setAiBookingMeetingTypeAction } from "@/app/dashboard/meeting-types/actions";
import { saveWorkspaceSettings } from "@/app/dashboard/settings/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  type WorkspaceSettingsFormProps,
  type WorkspaceSettingsState,
} from "@/lib/workspace-settings-types";
import { toast } from "sonner";

const initial: WorkspaceSettingsState = {};

export type { WorkspaceSettingsValues } from "@/lib/workspace-settings-types";

export function WorkspaceSettingsForm({
  workspace,
  meetingTypes,
}: WorkspaceSettingsFormProps) {
  const router = useRouter();
  const [state, action, pending] = useActionState(saveWorkspaceSettings, initial);
  const [selectPending, startSelect] = useTransition();

  const aiRow = meetingTypes.find((r) => r.is_ai_booking) ?? null;

  useEffect(() => {
    if (state.success) {
      toast.success(state.success);
      router.refresh();
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state, router]);

  return (
    <div className="grid max-w-3xl gap-6 px-4 pb-8 lg:px-6">
      <form action={action} className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Liên hệ & nhận diện</CardTitle>
            <CardDescription>
              Thông tin khách thấy khi agent giới thiệu workspace.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="name">Tên workspace</Label>
              <Input
                defaultValue={workspace?.name ?? ""}
                id="name"
                name="name"
                placeholder="Eve Pilot"
                required
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="tagline">Tagline</Label>
              <Input
                defaultValue={workspace?.tagline ?? ""}
                id="tagline"
                name="tagline"
                placeholder="Trợ lý đặt lịch 24/7 cho phòng khám / studio"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="timezone">Timezone</Label>
              <Input
                defaultValue={workspace?.timezone ?? "Asia/Ho_Chi_Minh"}
                id="timezone"
                name="timezone"
                placeholder="Asia/Ho_Chi_Minh"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Số điện thoại</Label>
              <Input
                defaultValue={workspace?.phone ?? ""}
                id="phone"
                name="phone"
                placeholder="0901234567"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                defaultValue={workspace?.email ?? ""}
                id="email"
                name="email"
                placeholder="hello@example.com"
                type="email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="website">Website</Label>
              <Input
                defaultValue={workspace?.website ?? ""}
                id="website"
                name="website"
                placeholder="https://example.com"
                type="url"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="address">Địa chỉ</Label>
              <Input
                defaultValue={workspace?.address ?? ""}
                id="address"
                name="address"
                placeholder="123 Nguyễn Huệ, Quận 1, TP.HCM"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Hồ sơ cho AI</CardTitle>
            <CardDescription>
              Agent đọc các mục này qua skill <code>booking_faq</code> khi trả lời
              khách. FAQ chi tiết quản lý ở trang{" "}
              <Link
                className="underline underline-offset-4"
                href="/dashboard/faq"
              >
                FAQ
              </Link>
              .
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="space-y-2">
              <Label htmlFor="about">Giới thiệu</Label>
              <Textarea
                defaultValue={workspace?.about ?? ""}
                id="about"
                name="about"
                placeholder="Mô tả ngắn về workspace / dịch vụ / đối tượng khách…"
                rows={4}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="business_hours">Giờ làm việc</Label>
              <Textarea
                defaultValue={workspace?.businessHours ?? ""}
                id="business_hours"
                name="business_hours"
                placeholder={"- Thứ 2–Thứ 7: 08:00–20:00\n- Chủ nhật: 08:00–12:00"}
                rows={4}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="services_summary">Tóm tắt dịch vụ</Label>
              <Textarea
                defaultValue={workspace?.servicesSummary ?? ""}
                id="services_summary"
                name="services_summary"
                placeholder={"- Consultation 30 phút\n- Khám tổng quát 90 phút"}
                rows={4}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="agent_instructions">Hướng dẫn cho agent</Label>
              <Textarea
                defaultValue={workspace?.agentInstructions ?? ""}
                id="agent_instructions"
                name="agent_instructions"
                placeholder={
                  "- Giọng điệu, điều không được hứa\n- Quy tắc đặt / hủy lịch\n- Khi nào chuyển sang gọi SĐT"
                }
                rows={5}
              />
              <p className="text-muted-foreground text-xs">
                Ghi chú vận hành riêng — không thay FAQ hỏi–đáp.
              </p>
            </div>
          </CardContent>
        </Card>

        {state.error ? (
          <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {state.error}
          </p>
        ) : null}

        <div>
          <Button disabled={pending} type="submit">
            {pending ? "Đang lưu…" : "Lưu cấu hình"}
          </Button>
        </div>
      </form>

      <Card>
        <CardHeader>
          <CardTitle>AI booking meeting type</CardTitle>
          <CardDescription>
            Chọn meeting type Cal.com mà agent dùng khi check slot / đặt lịch.
            Quản lý danh sách ở{" "}
            <Link
              className="underline underline-offset-4"
              href="/dashboard/meeting-types"
            >
              Meeting types
            </Link>
            .
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {meetingTypes.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Chưa có meeting type. Vào{" "}
              <Link
                className="underline underline-offset-4"
                href="/dashboard/meeting-types"
              >
                Meeting types
              </Link>{" "}
              để sync hoặc tạo mới.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-muted-foreground">Đang dùng:</span>
                {aiRow ? (
                  <>
                    <span className="font-medium">{aiRow.title}</span>
                    <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
                      AI booking
                    </Badge>
                    <span className="text-muted-foreground text-xs">
                      {aiRow.length_minutes} phút · `{aiRow.slug}`
                    </span>
                  </>
                ) : (
                  <span className="text-sm text-amber-600 dark:text-amber-400">
                    Chưa chọn
                  </span>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="ai-meeting-type">Chọn meeting type</Label>
                <Select
                  disabled={selectPending}
                  value={aiRow?.id ?? undefined}
                  onValueChange={(id) => {
                    startSelect(async () => {
                      const result = await setAiBookingMeetingTypeAction(id);
                      if (result.error) toast.error(result.error);
                      else if (result.success) {
                        toast.success(result.success);
                        router.refresh();
                      }
                    });
                  }}
                >
                  <SelectTrigger id="ai-meeting-type">
                    <SelectValue placeholder="Chọn type cho AI…" />
                  </SelectTrigger>
                  <SelectContent>
                    {meetingTypes.map((row) => (
                      <SelectItem key={row.id} value={row.id}>
                        {row.title} ({row.length_minutes} phút)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
