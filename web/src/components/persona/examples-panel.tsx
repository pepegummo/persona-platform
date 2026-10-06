"use client";

import { Globe, Lock, MessageSquarePlus, Pencil, Plus, Trash2, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { Example, ExampleCreate, ExampleUpdate } from "@/lib/api/client";
import { MIN_PUBLIC_EXAMPLES } from "@/lib/persona-progress";

type Props = {
  examples: Example[];
  busy: boolean;
  onAdd: (data: ExampleCreate) => Promise<boolean>;
  onUpdate: (id: string, data: ExampleUpdate) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
};

type Editing = { id: string | null; question: string; answer: string; is_private: boolean };

const EMPTY: Editing = { id: null, question: "", answer: "", is_private: true };

function PrivacyChip({ isPrivate }: { isPrivate: boolean }) {
  const t = useTranslations("persona.examplesTab");
  return isPrivate ? (
    <Badge variant="muted">
      <Lock aria-hidden="true" />
      {t("private")}
    </Badge>
  ) : (
    <Badge variant="success">
      <Globe aria-hidden="true" />
      {t("public")}
    </Badge>
  );
}

function ExampleCard({
  ex,
  busy,
  onEdit,
  onDelete,
  onTogglePublic,
}: {
  ex: Example;
  busy: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onTogglePublic: (isPublic: boolean) => void;
}) {
  const t = useTranslations("persona.examplesTab");
  const ts = useTranslations("shape");
  const tc = useTranslations("common");
  const switchId = `public-${ex.id}`;
  return (
    <article className="flex flex-col gap-2.5 rounded-2xl border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        {ex.shape && <Badge variant="secondary">{ts(ex.shape)}</Badge>}
        <PrivacyChip isPrivate={ex.is_private} />
        <div className="ml-auto flex items-center gap-1">
          <div className="mr-1 flex items-center gap-2">
            <Switch
              id={switchId}
              checked={!ex.is_private}
              disabled={busy}
              onCheckedChange={onTogglePublic}
            />
            <Label htmlFor={switchId} className="text-sm font-normal text-muted-foreground">
              {t("public")}
            </Label>
          </div>
          <Button size="icon" variant="ghost" disabled={busy} onClick={onEdit} aria-label={tc("edit")}>
            <Pencil aria-hidden="true" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            disabled={busy}
            onClick={onDelete}
            aria-label={tc("delete")}
            className="hover:text-destructive"
          >
            <Trash2 aria-hidden="true" />
          </Button>
        </div>
      </div>
      <h3 className="font-semibold whitespace-pre-wrap">{ex.question}</h3>
      <p className="line-clamp-3 whitespace-pre-wrap text-[15px] text-muted-foreground">{ex.answer}</p>
    </article>
  );
}

export function ExamplesPanel({ examples, busy, onAdd, onUpdate, onDelete }: Props) {
  const t = useTranslations("persona.examplesTab");
  const tc = useTranslations("common");
  const [editing, setEditing] = useState<Editing | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const publicCount = examples.filter((e) => !e.is_private).length;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const data = {
      question: editing.question,
      answer: editing.answer,
      is_private: editing.is_private,
    };
    const ok = editing.id ? await onUpdate(editing.id, data) : await onAdd(data);
    if (ok) setEditing(null);
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-[1_1_300px]">
          <h2 className="text-xl font-semibold">{t("title")}</h2>
          <p className="text-sm text-muted-foreground">{t("hint")}</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant={publicCount >= MIN_PUBLIC_EXAMPLES ? "success" : "outline"}>
            {t("publicCount", { n: publicCount, total: examples.length })}
          </Badge>
          <Button onClick={() => setEditing(EMPTY)} disabled={busy}>
            <Plus data-icon="inline-start" aria-hidden="true" />
            {t("addExample")}
          </Button>
        </div>
      </div>

      <Alert variant="warning">
        <TriangleAlert aria-hidden="true" />
        <AlertTitle>{t("warningTitle")}</AlertTitle>
        <AlertDescription>{t("warning")}</AlertDescription>
      </Alert>

      {examples.length === 0 ? (
        <EmptyState
          icon={MessageSquarePlus}
          title={t("empty")}
          description={t("emptyBody")}
          action={
            <Button size="lg" onClick={() => setEditing(EMPTY)} disabled={busy}>
              {t("addFirst")}
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          {examples.map((ex) => (
            <ExampleCard
              key={ex.id}
              ex={ex}
              busy={busy}
              onEdit={() =>
                setEditing({
                  id: ex.id,
                  question: ex.question,
                  answer: ex.answer,
                  is_private: ex.is_private,
                })
              }
              onDelete={() => setDeleting(ex.id)}
              onTogglePublic={(isPublic) => void onUpdate(ex.id, { is_private: !isPublic })}
            />
          ))}
        </div>
      )}

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t("deleteTitle")}
        description={t("deleteBody")}
        confirmLabel={tc("delete")}
        destructive
        onConfirm={() => {
          if (deleting) void onDelete(deleting);
        }}
      />

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-w-2xl rounded-2xl p-6">
          <form onSubmit={submit} className="flex flex-col gap-5">
            <DialogHeader>
              <DialogTitle className="text-lg">
                {editing?.id ? t("editExample") : t("addExample")}
              </DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-2">
              <Label htmlFor="ex_question">{t("question")}</Label>
              <Textarea
                id="ex_question"
                rows={2}
                required
                maxLength={8000}
                placeholder={t("questionPlaceholder")}
                value={editing?.question ?? ""}
                onChange={(e) => setEditing((s) => s && { ...s, question: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="ex_answer">{t("answer")}</Label>
              <Textarea
                id="ex_answer"
                rows={8}
                required
                maxLength={16000}
                placeholder={t("answerPlaceholder")}
                className="max-h-[50dvh]"
                value={editing?.answer ?? ""}
                onChange={(e) => setEditing((s) => s && { ...s, answer: e.target.value })}
              />
            </div>
            <div className="flex items-start gap-3 rounded-xl bg-muted p-3">
              <Switch
                id="ex_public"
                checked={editing ? !editing.is_private : false}
                onCheckedChange={(checked) =>
                  setEditing((s) => s && { ...s, is_private: !checked })
                }
              />
              <div className="flex flex-col gap-0.5">
                <Label htmlFor="ex_public">{t("public")}</Label>
                <span className="text-sm text-muted-foreground">{t("privateHint")}</span>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
                {tc("cancel")}
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? tc("saving") : tc("save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
