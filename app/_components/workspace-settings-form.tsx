"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { setAiBookingMeetingTypeAction } from "@/app/dashboard/meeting-types/actions";
import {
  checkWorkspaceSlugAvailable,
  saveWorkspaceSettings,
} from "@/app/dashboard/settings/actions";
import { CopyBookingLink } from "@/components/copy-booking-link";
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
import { TimezoneSelect } from "@/components/timezone-select";
import {
  DEFAULT_CHAT_ASSISTANT_LABEL,
  DEFAULT_CHAT_INTRO,
  DEFAULT_CHAT_SUGGESTIONS,
  MAX_CHAT_SUGGESTIONS,
  type ChatSuggestion,
} from "@/lib/chat-branding";
import { slugifyWorkspaceName } from "@/lib/workspace";
import {
  type WorkspaceSettingsFormProps,
  type WorkspaceSettingsState,
} from "@/lib/workspace-settings-types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { PlusIcon, Trash2Icon } from "lucide-react";

const initial: WorkspaceSettingsState = {};

export type { WorkspaceSettingsValues } from "@/lib/workspace-settings-types";

type SlugStatus = {
  available: boolean;
  slug: string;
  message: string;
} | null;

type SuggestionDraft = ChatSuggestion & { key: string };

export function WorkspaceSettingsForm({
  workspace,
  meetingTypes,
  publicBookingUrl,
}: WorkspaceSettingsFormProps) {
  const router = useRouter();
  const [state, action, pending] = useActionState(saveWorkspaceSettings, initial);
  const [selectPending, startSelect] = useTransition();
  const [name, setName] = useState(workspace?.name ?? "");
  const [slug, setSlug] = useState(workspace?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(false);
  const [slugStatus, setSlugStatus] = useState<SlugStatus>(null);
  const [slugChecking, setSlugChecking] = useState(false);
  const [suggestions, setSuggestions] = useState<SuggestionDraft[]>(() =>
    (workspace?.chatSuggestions?.length
      ? workspace.chatSuggestions
      : DEFAULT_CHAT_SUGGESTIONS
    ).map((item, i) => ({ ...item, key: `s-${i}` })),
  );

  const aiRow = meetingTypes.find((r) => r.is_ai_booking) ?? null;

  useEffect(() => {
    setName(workspace?.name ?? "");
    setSlug(workspace?.slug ?? "");
    setSlugTouched(false);
    setSlugStatus(null);
    setSuggestions(
      (workspace?.chatSuggestions?.length
        ? workspace.chatSuggestions
        : DEFAULT_CHAT_SUGGESTIONS
      ).map((item, i) => ({ ...item, key: `s-${i}-${item.label}` })),
    );
  }, [workspace]);

  useEffect(() => {
    if (state.success) {
      toast.success(state.success);
      router.refresh();
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state, router]);

  useEffect(() => {
    const normalized = slugifyWorkspaceName(slug);
    if (!normalized || normalized.length < 2) {
      setSlugStatus(null);
      return;
    }

    let cancelled = false;
    setSlugChecking(true);
    const timer = window.setTimeout(async () => {
      const result = await checkWorkspaceSlugAvailable(normalized);
      if (!cancelled) {
        setSlugStatus(result);
        setSlugChecking(false);
      }
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [slug]);

  return (
    <div className="grid gap-6 px-4 pb-10 lg:grid-cols-[minmax(0,1fr)_minmax(17.5rem,22rem)] lg:items-start lg:gap-8 lg:px-6 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)]">
      <div className="min-w-0 space-y-6">
        <form
          action={action}
          className="flex flex-col gap-6"
          id="workspace-settings-form"
        >
          <Card>
            <CardHeader>
              <CardTitle>Liên hệ & nhận diện</CardTitle>
              <CardDescription>
                Thông tin khách thấy khi agent giới thiệu workspace.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <div className="space-y-2 sm:col-span-2 xl:col-span-2">
                <Label htmlFor="name">Tên workspace</Label>
                <Input
                  id="name"
                  name="name"
                  onChange={(e) => {
                    const next = e.target.value;
                    setName(next);
                    if (!slugTouched) setSlug(slugifyWorkspaceName(next));
                  }}
                  placeholder="Eve Pilot"
                  required
                  value={name}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="timezone">Timezone</Label>
                <TimezoneSelect
                  defaultValue={workspace?.timezone ?? "Asia/Ho_Chi_Minh"}
                  id="timezone"
                  name="timezone"
                  required
                />
              </div>
              <div className="space-y-2 sm:col-span-2 xl:col-span-3">
                <Label htmlFor="slug">Slug trang đặt lịch</Label>
                <Input
                  aria-invalid={slugStatus ? !slugStatus.available : undefined}
                  id="slug"
                  name="slug"
                  onChange={(e) => {
                    setSlugTouched(true);
                    setSlug(e.target.value);
                  }}
                  placeholder="phong-kham-hoa"
                  required
                  value={slug}
                />
                <p className="text-muted-foreground text-xs">
                  URL công khai: /b/{slugifyWorkspaceName(slug) || "…"}
                </p>
                {slugChecking ? (
                  <p className="text-muted-foreground text-xs">
                    Đang kiểm tra slug…
                  </p>
                ) : slugStatus ? (
                  <p
                    className={cn(
                      "text-xs",
                      slugStatus.available
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-destructive",
                    )}
                  >
                    {slugStatus.message}
                  </p>
                ) : null}
              </div>
              <div className="space-y-2 sm:col-span-2 xl:col-span-3">
                <Label htmlFor="tagline">Tagline</Label>
                <Input
                  defaultValue={workspace?.tagline ?? ""}
                  id="tagline"
                  name="tagline"
                  placeholder="Trợ lý đặt lịch 24/7 cho phòng khám / studio"
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
              <div className="space-y-2 sm:col-span-2 xl:col-span-3">
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
                Agent đọc các mục này qua skill <code>booking_faq</code> khi trả
                lời khách. FAQ chi tiết quản lý ở trang{" "}
                <Link
                  className="underline underline-offset-4"
                  href="/dashboard/faq"
                >
                  FAQ
                </Link>
                .
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
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
                  placeholder={
                    "- Thứ 2–Thứ 7: 08:00–20:00\n- Chủ nhật: 08:00–12:00"
                  }
                  rows={5}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="services_summary">Tóm tắt dịch vụ</Label>
                <Textarea
                  defaultValue={workspace?.servicesSummary ?? ""}
                  id="services_summary"
                  name="services_summary"
                  placeholder={
                    "- Consultation 30 phút\n- Khám tổng quát 90 phút"
                  }
                  rows={5}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
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

          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
              <div className="space-y-1.5">
                <CardTitle>Màn hình chat trống</CardTitle>
                <CardDescription>
                  Nhãn AI, mô tả và các nút câu hỏi mặc định trên trang đặt lịch.
                  Để trống / xóa hết gợi ý để dùng nội dung mặc định chung của
                  Eve.
                </CardDescription>
              </div>
              <Button
                disabled={pending || suggestions.length >= MAX_CHAT_SUGGESTIONS}
                onClick={() =>
                  setSuggestions((prev) => [
                    ...prev,
                    {
                      key: `s-new-${Date.now()}`,
                      label: "",
                      prompt: "",
                    },
                  ])
                }
                size="sm"
                type="button"
                variant="outline"
              >
                <PlusIcon className="size-4" />
                Thêm
              </Button>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <input
                name="chat_suggestions"
                type="hidden"
                value={JSON.stringify(
                  suggestions.map(({ label, prompt }) => ({ label, prompt })),
                )}
              />
              <div className="space-y-2">
                <Label htmlFor="chat_assistant_label">Nhãn AI (eyebrow)</Label>
                <Input
                  defaultValue={workspace?.chatAssistantLabel ?? ""}
                  id="chat_assistant_label"
                  name="chat_assistant_label"
                  placeholder={DEFAULT_CHAT_ASSISTANT_LABEL}
                />
              </div>
              <div className="space-y-2 md:row-span-2">
                <Label htmlFor="chat_intro">Mô tả dưới tên</Label>
                <Textarea
                  defaultValue={workspace?.chatIntro ?? ""}
                  id="chat_intro"
                  name="chat_intro"
                  placeholder={DEFAULT_CHAT_INTRO}
                  rows={4}
                />
              </div>
              <div className="space-y-3 md:col-span-2">
                <Label>Câu hỏi mặc định (tối đa {MAX_CHAT_SUGGESTIONS})</Label>
                {suggestions.length === 0 ? (
                  <p className="rounded-lg border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
                    Chưa có gợi ý — sẽ dùng bộ mặc định của Eve khi lưu trống.
                  </p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {suggestions.map((item, index) => (
                      <div
                        className="flex flex-col gap-2 rounded-xl border border-border/60 bg-muted/20 p-3"
                        key={item.key}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium">
                            Gợi ý #{index + 1}
                          </p>
                          <Button
                            aria-label="Xóa gợi ý"
                            disabled={pending}
                            onClick={() =>
                              setSuggestions((prev) =>
                                prev.filter((s) => s.key !== item.key),
                              )
                            }
                            size="icon-sm"
                            type="button"
                            variant="ghost"
                          >
                            <Trash2Icon className="size-4" />
                          </Button>
                        </div>
                        <Input
                          onChange={(e) =>
                            setSuggestions((prev) =>
                              prev.map((s) =>
                                s.key === item.key
                                  ? { ...s, label: e.target.value }
                                  : s,
                              ),
                            )
                          }
                          placeholder="Nhãn nút — ví dụ: Giờ mở cửa"
                          value={item.label}
                        />
                        <Input
                          onChange={(e) =>
                            setSuggestions((prev) =>
                              prev.map((s) =>
                                s.key === item.key
                                  ? { ...s, prompt: e.target.value }
                                  : s,
                              ),
                            )
                          }
                          placeholder="Nội dung gửi khi bấm — ví dụ: Giờ mở cửa hôm nay?"
                          value={item.prompt}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {state.error ? (
            <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {state.error}
            </p>
          ) : null}

          <div className="lg:hidden">
            <Button
              disabled={
                pending || slugChecking || slugStatus?.available === false
              }
              type="submit"
            >
              {pending ? "Đang lưu…" : "Lưu cấu hình"}
            </Button>
          </div>
        </form>
      </div>

      <aside className="flex flex-col gap-6 lg:sticky lg:top-20">
        {publicBookingUrl ? (
          <Card>
            <CardHeader>
              <CardTitle>Trang đặt lịch công khai</CardTitle>
              <CardDescription>
                Gắn lên website, bio IG, Zalo hoặc QR. Khách chat và book vào
                workspace này.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <CopyBookingLink url={publicBookingUrl} />
              <Button asChild className="w-full" size="sm" variant="secondary">
                <Link href={publicBookingUrl} target="_blank">
                  Mở trang đặt lịch
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>AI booking meeting type</CardTitle>
            <CardDescription>
              Meeting type Cal.com mà agent dùng khi check slot / đặt lịch.
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
                <div className="flex flex-col gap-2 rounded-lg border border-border/60 bg-muted/20 p-3">
                  <span className="text-muted-foreground text-xs uppercase tracking-wide">
                    Đang dùng
                  </span>
                  {aiRow ? (
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{aiRow.title}</span>
                        <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
                          AI booking
                        </Badge>
                      </div>
                      <p className="text-muted-foreground text-xs">
                        {aiRow.length_minutes} phút · `{aiRow.slug}`
                      </p>
                    </div>
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

        <Card className="hidden lg:block">
          <CardContent className="flex flex-col gap-3 pt-6">
            <Button
              disabled={
                pending || slugChecking || slugStatus?.available === false
              }
              form="workspace-settings-form"
              type="submit"
            >
              {pending ? "Đang lưu…" : "Lưu cấu hình"}
            </Button>
            <p className="text-muted-foreground text-xs leading-relaxed">
              Đổi slug sẽ đổi URL công khai. FAQ và meeting types quản lý ở
              trang riêng.
            </p>
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}
