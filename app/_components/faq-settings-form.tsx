"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useId, useState } from "react";
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { saveFaqSettings } from "@/app/dashboard/faq/actions";
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
import {
  MAX_FAQ_ITEMS,
  type FaqDraftItem,
  type FaqSettingsFormProps,
  type FaqSettingsState,
  type WorkspaceFaqRecord,
} from "@/lib/workspace-faq-types";

const initial: FaqSettingsState = {};

function toDraftItems(faq: WorkspaceFaqRecord | null): FaqDraftItem[] {
  if (!faq?.items.length) return [];
  return faq.items.map((item) => ({
    key: item.id,
    question: item.question,
    answer: item.answer,
  }));
}

export function FaqSettingsForm({ faq, previewMarkdown }: FaqSettingsFormProps) {
  const router = useRouter();
  const formId = useId();
  const [state, action, pending] = useActionState(saveFaqSettings, initial);
  const [items, setItems] = useState<FaqDraftItem[]>(() => toDraftItems(faq));

  useEffect(() => {
    if (state.success) {
      router.refresh();
    }
  }, [state.success, router]);

  useEffect(() => {
    setItems(toDraftItems(faq));
  }, [faq]);

  function addItem() {
    if (items.length >= MAX_FAQ_ITEMS) return;
    setItems((prev) => [
      ...prev,
      { key: `${formId}-${Date.now()}-${prev.length}`, question: "", answer: "" },
    ]);
  }

  function removeItem(key: string) {
    setItems((prev) => prev.filter((item) => item.key !== key));
  }

  function moveItem(index: number, direction: -1 | 1) {
    setItems((prev) => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      const tmp = next[index]!;
      next[index] = next[target]!;
      next[target] = tmp;
      return next;
    });
  }

  function updateItem(
    key: string,
    field: "question" | "answer",
    value: string,
  ) {
    setItems((prev) =>
      prev.map((item) => (item.key === key ? { ...item, [field]: value } : item)),
    );
  }

  const faqItemsJson = JSON.stringify(
    items.map(({ question, answer }) => ({ question, answer })),
  );

  return (
    <div className="grid gap-6 px-4 pb-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,36rem)] lg:px-6">
      <form action={action} className="flex flex-col gap-6">
        <input name="faq_items" type="hidden" value={faqItemsJson} />

        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
            <div className="space-y-1.5">
              <CardTitle>Nội dung FAQ</CardTitle>
              <CardDescription>
                Mỗi mục là một câu hỏi / câu trả lời. Agent load qua skill{" "}
                <code>booking_faq</code> mỗi lượt chat. Tối đa {MAX_FAQ_ITEMS} mục.
              </CardDescription>
            </div>
            <Button
              disabled={pending || items.length >= MAX_FAQ_ITEMS}
              onClick={addItem}
              size="sm"
              type="button"
              variant="outline"
            >
              <PlusIcon className="size-4" />
              Thêm FAQ
            </Button>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            {items.length === 0 ? (
              <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
                Chưa có FAQ. Bấm “Thêm FAQ” để tạo mục đầu tiên.
              </p>
            ) : (
              items.map((item, index) => (
                <div
                  className="flex flex-col gap-3 border-b border-border/60 pb-5 last:border-b-0 last:pb-0"
                  key={item.key}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">FAQ #{index + 1}</p>
                    <div className="flex items-center gap-1">
                      <Button
                        aria-label="Di chuyển lên"
                        disabled={pending || index === 0}
                        onClick={() => moveItem(index, -1)}
                        size="icon-sm"
                        type="button"
                        variant="ghost"
                      >
                        <ArrowUpIcon className="size-4" />
                      </Button>
                      <Button
                        aria-label="Di chuyển xuống"
                        disabled={pending || index === items.length - 1}
                        onClick={() => moveItem(index, 1)}
                        size="icon-sm"
                        type="button"
                        variant="ghost"
                      >
                        <ArrowDownIcon className="size-4" />
                      </Button>
                      <Button
                        aria-label="Xóa FAQ"
                        disabled={pending}
                        onClick={() => removeItem(item.key)}
                        size="icon-sm"
                        type="button"
                        variant="ghost"
                      >
                        <Trash2Icon className="size-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`question-${item.key}`}>Câu hỏi</Label>
                    <Input
                      id={`question-${item.key}`}
                      onChange={(e) =>
                        updateItem(item.key, "question", e.target.value)
                      }
                      placeholder="Ví dụ: Giờ mở cửa?"
                      value={item.question}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`answer-${item.key}`}>Câu trả lời</Label>
                    <Textarea
                      id={`answer-${item.key}`}
                      onChange={(e) =>
                        updateItem(item.key, "answer", e.target.value)
                      }
                      placeholder="Markdown bullets được hỗ trợ — ví dụ: - Thứ 2–Thứ 7: 08:00–20:00"
                      rows={3}
                      value={item.answer}
                    />
                  </div>
                </div>
              ))
            )}
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
