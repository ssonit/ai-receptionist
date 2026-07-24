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
              <CardTitle>FAQ content</CardTitle>
              <CardDescription>
                Each item is a question / answer. The agent loads them via the{" "}
                <code>booking_faq</code> skill on every chat turn. Max{" "}
                {MAX_FAQ_ITEMS} items.
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
              Add FAQ
            </Button>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            {items.length === 0 ? (
              <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
                No FAQ yet. Click “Add FAQ” to create the first item.
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
                        aria-label="Move up"
                        disabled={pending || index === 0}
                        onClick={() => moveItem(index, -1)}
                        size="icon-sm"
                        type="button"
                        variant="ghost"
                      >
                        <ArrowUpIcon className="size-4" />
                      </Button>
                      <Button
                        aria-label="Move down"
                        disabled={pending || index === items.length - 1}
                        onClick={() => moveItem(index, 1)}
                        size="icon-sm"
                        type="button"
                        variant="ghost"
                      >
                        <ArrowDownIcon className="size-4" />
                      </Button>
                      <Button
                        aria-label="Delete FAQ"
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
                    <Label htmlFor={`question-${item.key}`}>Question</Label>
                    <Input
                      id={`question-${item.key}`}
                      onChange={(e) =>
                        updateItem(item.key, "question", e.target.value)
                      }
                      placeholder="e.g. Opening hours?"
                      value={item.question}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`answer-${item.key}`}>Answer</Label>
                    <Textarea
                      id={`answer-${item.key}`}
                      onChange={(e) =>
                        updateItem(item.key, "answer", e.target.value)
                      }
                      placeholder="Markdown bullets supported — e.g. - Mon–Sat: 08:00–20:00"
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
            {pending ? "Saving…" : "Save FAQ"}
          </Button>
          <p className="text-sm text-muted-foreground">
            Changes take effect on the next chat turn.
          </p>
        </div>
      </form>

      <aside className="lg:sticky lg:top-4 lg:self-start">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Preview skill</CardTitle>
            <CardDescription>
              Content the agent receives via <code>booking_faq</code> after saving.
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
