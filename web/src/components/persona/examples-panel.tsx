"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import type { Example, ExampleCreate, ExampleUpdate } from "@/lib/api/client";

type Props = {
  examples: Example[];
  busy: boolean;
  onAdd: (data: ExampleCreate) => Promise<boolean>;
  onUpdate: (id: string, data: ExampleUpdate) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
};

type Editing = { id: string | null; question: string; answer: string; is_private: boolean };

const EMPTY: Editing = { id: null, question: "", answer: "", is_private: true };

export function ExamplesPanel({ examples, busy, onAdd, onUpdate, onDelete }: Props) {
  const t = useTranslations("persona.examplesTab");
  const tc = useTranslations("common");
  const [editing, setEditing] = useState<Editing | null>(null);

  const publicCount = examples.filter((e) => !e.is_private).length;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const ok = editing.id
      ? await onUpdate(editing.id, {
          question: editing.question,
          answer: editing.answer,
          is_private: editing.is_private,
        })
      : await onAdd({
          question: editing.question,
          answer: editing.answer,
          is_private: editing.is_private,
        });
    if (ok) setEditing(null);
  }

  return (
    <div className="flex flex-col gap-5">
      <Alert>
        <AlertTitle>{t("warningTitle")}</AlertTitle>
        <AlertDescription>{t("warning")}</AlertDescription>
      </Alert>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium">{t("title")}</h2>
          <p className="text-sm text-muted-foreground">{t("hint")}</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline">
            {t("publicCount", { n: publicCount, total: examples.length })}
          </Badge>
          <Button onClick={() => setEditing(EMPTY)} disabled={busy}>
            {t("addExample")}
          </Button>
        </div>
      </div>

      {examples.length === 0 ? (
        <p className="text-muted-foreground">{t("empty")}</p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[30%]">{t("question")}</TableHead>
                <TableHead>{t("answer")}</TableHead>
                <TableHead className="w-24">{t("shape")}</TableHead>
                <TableHead className="w-28">{t("public")}</TableHead>
                <TableHead className="w-32" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {examples.map((ex) => (
                <TableRow key={ex.id}>
                  <TableCell className="whitespace-pre-wrap align-top">{ex.question}</TableCell>
                  <TableCell className="line-clamp-3 whitespace-pre-wrap align-top">
                    {ex.answer}
                  </TableCell>
                  <TableCell className="align-top">
                    {ex.shape && <Badge variant="secondary">{ex.shape}</Badge>}
                  </TableCell>
                  <TableCell className="align-top">
                    <Switch
                      checked={!ex.is_private}
                      disabled={busy}
                      onCheckedChange={(checked) =>
                        void onUpdate(ex.id, { is_private: !checked })
                      }
                      aria-label={t("public")}
                    />
                  </TableCell>
                  <TableCell className="align-top">
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() =>
                          setEditing({
                            id: ex.id,
                            question: ex.question,
                            answer: ex.answer,
                            is_private: ex.is_private,
                          })
                        }
                      >
                        {tc("edit")}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => {
                          if (window.confirm(tc("confirmDelete"))) void onDelete(ex.id);
                        }}
                      >
                        {tc("delete")}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-w-2xl">
          <form onSubmit={submit} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>{editing?.id ? t("editExample") : t("addExample")}</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-2">
              <Label htmlFor="ex_question">{t("question")}</Label>
              <Textarea
                id="ex_question"
                rows={2}
                required
                maxLength={8000}
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
                value={editing?.answer ?? ""}
                onChange={(e) => setEditing((s) => s && { ...s, answer: e.target.value })}
              />
            </div>
            <div className="flex items-center gap-3">
              <Switch
                id="ex_public"
                checked={editing ? !editing.is_private : false}
                onCheckedChange={(checked) =>
                  setEditing((s) => s && { ...s, is_private: !checked })
                }
              />
              <Label htmlFor="ex_public">{t("public")}</Label>
              <span className="text-xs text-muted-foreground">{t("privateHint")}</span>
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
