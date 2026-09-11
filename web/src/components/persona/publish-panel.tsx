"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import { NativeSelect } from "@/components/native-select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Persona } from "@/lib/api/client";

type Visibility = Persona["visibility"];

type Props = {
  persona: Persona;
  busy: boolean;
  onPublish: (visibility: Visibility) => Promise<boolean>;
  onUnpublish: () => Promise<boolean>;
};

export function PublishPanel({ persona, busy, onPublish, onUnpublish }: Props) {
  const t = useTranslations("persona.publish");
  const tv = useTranslations("visibility");
  const [visibility, setVisibility] = useState<Visibility>(
    persona.visibility === "private" ? "unlisted" : persona.visibility,
  );
  const draft = persona.draft;
  const publicCount = draft.examples.filter((e) => !e.is_private).length;
  const canPublish =
    draft.status === "ready" && publicCount >= 3 && draft.id !== persona.published_version_id;
  const shareUrl =
    typeof window !== "undefined" ? `${window.location.origin}/p/${persona.slug}` : `/p/${persona.slug}`;
  const isLive = persona.published_version_id !== null && persona.visibility !== "private";

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-muted-foreground">{t("hint")}</p>
      {draft.status !== "ready" && (
        <Alert>
          <AlertDescription>{t("needCompile")}</AlertDescription>
        </Alert>
      )}
      {publicCount < 3 && (
        <Alert>
          <AlertDescription>{t("needPublic", { n: publicCount })}</AlertDescription>
        </Alert>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="visibility">{t("visibility")}</Label>
          <NativeSelect
            id="visibility"
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as Visibility)}
          >
            <option value="unlisted">{tv("unlisted")}</option>
            <option value="public">{tv("public")}</option>
          </NativeSelect>
          <p className="text-xs text-muted-foreground">{t("visibilityHint")}</p>
        </div>
        <div className="flex items-end gap-2">
          <Button disabled={busy || !canPublish} onClick={() => void onPublish(visibility)}>
            {persona.published_version_id ? t("republish") : t("publish")}
          </Button>
          {persona.published_version_id && (
            <Button variant="outline" disabled={busy} onClick={() => void onUnpublish()}>
              {t("unpublish")}
            </Button>
          )}
        </div>
      </div>
      {isLive && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="share">{t("shareLink")}</Label>
          <div className="flex gap-2">
            <Input id="share" readOnly value={shareUrl} />
            <Button
              variant="outline"
              onClick={() => {
                void navigator.clipboard.writeText(shareUrl).then(() => toast.success(t("copied")));
              }}
            >
              {t("copy")}
            </Button>
            <Button variant="ghost" nativeButton={false} render={<a href={shareUrl} target="_blank" rel="noreferrer" />}>
              {t("open")}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("live", { v: persona.published?.version_number ?? 0, visibility: tv(persona.visibility) })}
          </p>
        </div>
      )}
    </div>
  );
}
