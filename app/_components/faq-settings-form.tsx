"use client";

import { useRouter } from "next/navigation";
import {
  useActionState,
  useEffect,
  useId,
  useState,
  useTransition,
} from "react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  PlusIcon,
  SparklesIcon,
  Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";
import {
  generateFaqDraftAction,
  saveFaqSettings,
} from "@/app/dashboard/(main)/faq/actions";
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
  FAQ_TEMPLATES,
  faqTemplateContextFromWorkspace,
  materializeFaqTemplate,
} from "@/lib/faq-templates";
import { DEFAULT_WORKSPACE_FAQ_ITEMS } from "@/lib/workspace-faq-defaults";
import {
  MAX_FAQ_ITEMS,
  type FaqDraftItem,
  type FaqSettingsFormProps,
  type FaqSettingsState,
  type WorkspaceFaqRecord,
} from "@/lib/workspace-faq-types";

const initial: FaqSettingsState = {};

function toDraftItems(
  faq: WorkspaceFaqRecord | null,
  formId: string,
): FaqDraftItem[] {
  if (faq?.items.length) {
    return faq.items.map((item) => ({
      key: item.id,
      question: item.question,
      answer: item.answer,
    }));
  }
  return DEFAULT_WORKSPACE_FAQ_ITEMS.map((item, index) => ({
    key: `${formId}-starter-${index}`,
    question: item.question,
    answer: item.answer,
  }));
}

function draftKey(formId: string, index: number) {
  return `${formId}-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`;
}

export function FaqSettingsForm({ faq, previewMarkdown }: FaqSettingsFormProps) {
  const router = useRouter();
  const formId = useId();
  const [state, action, pending] = useActionState(saveFaqSettings, initial);
  const [items, setItems] = useState<FaqDraftItem[]>(() =>
    toDraftItems(faq, formId),
  );
  const [generatePending, startGenerate] = useTransition();
  const [generateError, setGenerateError] = useState<string | null>(null);

  const templateCtx = faqTemplateContextFromWorkspace(faq);
  const usedQuestions = new Set(
    items.map((item) => item.question.trim().toLowerCase()).filter(Boolean),
  );
  const availableTemplates = FAQ_TEMPLATES.filter(
    (t) => !usedQuestions.has(t.question.toLowerCase()),
  );
  const busy = pending || generatePending;
  const canAdd = items.length < MAX_FAQ_ITEMS;

  useEffect(() => {
    if (state.success) {
      router.refresh();
    }
  }, [state.success, router]);

  useEffect(() => {
    setItems(toDraftItems(faq, formId));
  }, [faq, formId]);

  function addItem() {
    if (!canAdd) return;
    setItems((prev) => [
      ...prev,
      {
        key: draftKey(formId, prev.length),
        question: "",
        answer: "",
      },
    ]);
  }

  function addTemplate(templateId: string) {
    const template = FAQ_TEMPLATES.find((t) => t.id === templateId);
    if (!template || !canAdd) return;
    const material = materializeFaqTemplate(template, templateCtx);
    setItems((prev) => {
      if (prev.length >= MAX_FAQ_ITEMS) return prev;
      return [
        ...prev,
        {
          key: draftKey(formId, prev.length),
          question: material.question,
          answer: material.answer,
        },
      ];
    });
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

  function generateDrafts() {
    setGenerateError(null);
    startGenerate(async () => {
      const result = await generateFaqDraftAction();
      if (result.error) {
        setGenerateError(result.error);
        toast.error(result.error);
        return;
      }
      const generated = result.items ?? [];
      if (generated.length === 0) return;

      setItems((prev) => {
        const onlyEmpty =
          prev.length === 0 ||
          prev.every((item) => !item.question.trim() && !item.answer.trim());
        const base = onlyEmpty ? [] : prev;
        const room = MAX_FAQ_ITEMS - base.length;
        const appended = generated.slice(0, Math.max(0, room)).map((item, i) => ({
          key: draftKey(formId, base.length + i),
          question: item.question,
          answer: item.answer,
        }));
        return [...base, ...appended];
      });
      toast.success("Draft FAQ ready — review and Save when it looks good.");
    });
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
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
              <Button
                disabled={busy || !canAdd}
                onClick={generateDrafts}
                size="sm"
                type="button"
              >
                <SparklesIcon className="size-4" />
                {generatePending ? "Generating…" : "Generate draft"}
              </Button>
              <Button
                disabled={busy || !canAdd}
                onClick={addItem}
                size="sm"
                type="button"
                variant="outline"
              >
                <PlusIcon className="size-4" />
                Add FAQ
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            {availableTemplates.length > 0 && canAdd ? (
              <div className="space-y-2">
                <p className="text-sm font-medium">Suggested questions</p>
                <p className="text-xs text-muted-foreground">
                  Click to add a draft. Answers use Settings when available —
                  edit before saving.
                </p>
                <div className="flex flex-wrap gap-2">
                  {availableTemplates.map((template) => (
                    <Button
                      disabled={busy || !canAdd}
                      key={template.id}
                      onClick={() => addTemplate(template.id)}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      {template.label}
                    </Button>
                  ))}
                </div>
              </div>
            ) : null}

            {items.some((item) => item.key.includes("-starter-")) ? (
              <p className="text-muted-foreground text-xs leading-relaxed">
                Starter FAQ is pre-filled (same as Eve defaults). Edit anything,
                then Save to keep it for the agent.
              </p>
            ) : null}

            {items.length === 0 ? (
              <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
                No FAQ yet. Use a suggested question, Generate draft, or Add
                FAQ manually.
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
                        disabled={busy || index === 0}
                        onClick={() => moveItem(index, -1)}
                        size="icon-sm"
                        type="button"
                        variant="ghost"
                      >
                        <ArrowUpIcon className="size-4" />
                      </Button>
                      <Button
                        aria-label="Move down"
                        disabled={busy || index === items.length - 1}
                        onClick={() => moveItem(index, 1)}
                        size="icon-sm"
                        type="button"
                        variant="ghost"
                      >
                        <ArrowDownIcon className="size-4" />
                      </Button>
                      <Button
                        aria-label="Delete FAQ"
                        disabled={busy}
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

        {generateError ? (
          <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {generateError}
          </p>
        ) : null}
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
          <Button disabled={busy} type="submit">
            {pending ? "Saving…" : "Save FAQ"}
          </Button>
          <p className="text-sm text-muted-foreground">
            Drafts are not live until you save. Changes apply on the next chat
            turn.
          </p>
        </div>
      </form>

      <aside className="lg:sticky lg:top-4 lg:self-start">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Preview skill</CardTitle>
            <CardDescription>
              Content the agent receives via <code>booking_faq</code> after
              saving. Empty Settings fields are omitted until you fill them.
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
