"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { saveFaqSettings, type FaqSettingsState } from "@/app/dashboard/settings/actions";
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
import { Textarea } from "@/components/ui/textarea";
import type { WorkspaceFaqRecord } from "@/lib/workspace-faq";

const initial: FaqSettingsState = {};

type FaqSettingsFormProps = {
  faq: WorkspaceFaqRecord | null;
  previewMarkdown: string;
};

const faqFields = [
  {
    name: "opening_hours",
    label: "Giờ mở cửa",
    description: "Markdown bullets — ví dụ: - Thứ 2–Thứ 7: 08:00–20:00",
    rows: 4,
    key: "openingHours" as const,
  },
  {
    name: "services",
    label: "Dịch vụ phổ biến",
    description: "Các dịch vụ agent có thể gợi ý khi chat",
    rows: 4,
    key: "services" as const,
  },
  {
    name: "pricing",
    label: "Giá (tham khảo)",
    description: "Hướng dẫn giá — agent không cam kết giá cuối qua chat",
    rows: 3,
    key: "pricing" as const,
  },
  {
    name: "preparation",
    label: "Đặt lịch",
    description: "Quy trình đặt lịch, đến sớm bao lâu, v.v.",
    rows: 3,
    key: "preparation" as const,
  },
  {
    name: "cancel_policy",
    label: "Hủy / đổi lịch",
    description: "Chính sách hủy hoặc đổi lịch",
    rows: 3,
    key: "cancelPolicy" as const,
  },
  {
    name: "extra",
    label: "Thêm (tuỳ chọn)",
    description: "Nội dung bổ sung dưới mục “Thêm” trong skill FAQ",
    rows: 4,
    key: "extra" as const,
  },
];

export function FaqSettingsForm({ faq, previewMarkdown }: FaqSettingsFormProps) {
  const router = useRouter();
  const [state, action, pending] = useActionState(saveFaqSettings, initial);

  useEffect(() => {
    if (state.success) {
      router.refresh();
    }
  }, [state.success, router]);

  return (
    <div className="grid gap-6 px-4 pb-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:px-6">
      <form action={action} className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Thông tin workspace</CardTitle>
            <CardDescription>
              Agent dùng các trường này khi trả lời về liên hệ và địa chỉ.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="name">Tên workspace</Label>
              <Input
                defaultValue={faq?.name ?? ""}
                id="name"
                name="name"
                placeholder="Eve Pilot"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="timezone">Timezone</Label>
              <Input
                defaultValue={faq?.timezone ?? "Asia/Ho_Chi_Minh"}
                id="timezone"
                name="timezone"
                placeholder="Asia/Ho_Chi_Minh"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Số điện thoại</Label>
              <Input
                defaultValue={faq?.phone ?? ""}
                id="phone"
                name="phone"
                placeholder="0901234567"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="address">Địa chỉ</Label>
              <Input
                defaultValue={faq?.address ?? ""}
                id="address"
                name="address"
                placeholder="123 Nguyễn Huệ, Quận 1, TP.HCM"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Nội dung FAQ</CardTitle>
            <CardDescription>
              Mỗi mục là markdown (gợi ý dùng bullet <code>-</code>). Agent load qua skill{" "}
              <code>booking_faq</code> mỗi lượt chat.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            {faqFields.map((field) => (
              <div className="space-y-2" key={field.name}>
                <div>
                  <Label htmlFor={field.name}>{field.label}</Label>
                  <p className="mt-1 text-xs text-muted-foreground">{field.description}</p>
                </div>
                <Textarea
                  defaultValue={faq?.[field.key] ?? ""}
                  id={field.name}
                  name={field.name}
                  placeholder={field.description}
                  rows={field.rows}
                />
              </div>
            ))}
          </CardContent>
        </Card>

        {state.error ? (
          <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {state.error}
          </p>
        ) : null}
        {state.success ? (
          <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
            {state.success}
          </p>
        ) : null}

        <div className="flex items-center gap-3">
          <Button disabled={pending} type="submit">
            {pending ? "Đang lưu…" : "Lưu FAQ"}
          </Button>
          <p className="text-sm text-muted-foreground">
            Thay đổi có hiệu lực ngay ở lượt chat tiếp theo.
          </p>
        </div>
      </form>

      <aside className="lg:sticky lg:top-4 lg:self-start">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Preview skill</CardTitle>
            <CardDescription>
              Nội dung agent nhận qua <code>booking_faq</code> sau khi lưu.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="max-h-[calc(100vh-12rem)] overflow-auto rounded-lg border bg-muted/40 p-3 text-xs leading-relaxed whitespace-pre-wrap">
              {previewMarkdown}
            </pre>
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}
