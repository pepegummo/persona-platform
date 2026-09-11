"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import { RequireAuth } from "@/components/require-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "@/lib/api/client";
import { useApi } from "@/lib/api/use-api";

function CreateForm() {
  const t = useTranslations();
  const api = useApi();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const slug = String(form.get("slug") ?? "").trim();
    setBusy(true);
    const { data, error } = await api.POST("/api/personas", {
      body: {
        display_name: String(form.get("display_name") ?? "").trim(),
        slug: slug || null,
        description: String(form.get("description") ?? "").trim() || null,
      },
    });
    setBusy(false);
    if (data) {
      router.push(`/studio/${data.id}`);
    } else {
      toast.error(errorMessage(error, t("common.error")));
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex max-w-lg flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="display_name">{t("persona.displayName")}</Label>
        <Input id="display_name" name="display_name" required maxLength={80} />
        <p className="text-xs text-muted-foreground">{t("persona.displayNameHint")}</p>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="slug">
          {t("persona.slug")}{" "}
          <span className="text-muted-foreground">({t("common.optional")})</span>
        </Label>
        <Input id="slug" name="slug" pattern="[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?" />
        <p className="text-xs text-muted-foreground">{t("persona.slugHint")}</p>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="description">{t("persona.description")}</Label>
        <Textarea id="description" name="description" maxLength={1000} rows={3} />
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>
          {busy ? t("common.saving") : t("persona.create")}
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.back()}>
          {t("common.cancel")}
        </Button>
      </div>
    </form>
  );
}

export default function NewPersonaPage() {
  const t = useTranslations("persona");
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8">
      <h1 className="text-2xl font-semibold">{t("createTitle")}</h1>
      <RequireAuth>
        <CreateForm />
      </RequireAuth>
    </main>
  );
}
