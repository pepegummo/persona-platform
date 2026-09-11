"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { ExamplesPanel } from "@/components/persona/examples-panel";
import { SettingsForm } from "@/components/persona/settings-form";
import { RequireAuth } from "@/components/require-auth";
import { StatusBadge } from "@/components/status-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  errorMessage,
  type ExampleCreate,
  type ExampleUpdate,
  type Persona,
  type PersonaUpdate,
} from "@/lib/api/client";
import { useApi } from "@/lib/api/use-api";

function Editor({ id }: { id: string }) {
  const t = useTranslations();
  const api = useApi();
  const [persona, setPersona] = useState<Persona | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    const { data, error } = await api.GET("/api/personas/{persona_id}", {
      params: { path: { persona_id: id } },
    });
    if (data) setPersona(data);
    else setError(errorMessage(error));
  }, [api, id]);

  useEffect(() => {
    let cancelled = false;
    void api
      .GET("/api/personas/{persona_id}", { params: { path: { persona_id: id } } })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (data) setPersona(data);
        else setError(errorMessage(error));
      });
    return () => {
      cancelled = true;
    };
  }, [api, id]);

  async function run(op: () => Promise<{ error?: unknown }>): Promise<boolean> {
    setBusy(true);
    const { error } = await op();
    if (error) {
      toast.error(errorMessage(error, t("common.error")));
      setBusy(false);
      return false;
    }
    await reload();
    setBusy(false);
    toast.success(t("common.saved"));
    return true;
  }

  const path = { params: { path: { persona_id: id } } };

  if (error) return <p className="text-destructive">{error}</p>;
  if (!persona) return <Skeleton className="h-64 w-full" />;

  const isPublishedLatest =
    persona.published_version_id !== null &&
    persona.published_version_id === persona.draft.id;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">{persona.draft.display_name}</h1>
        <Badge variant="outline">
          {t("status.version", { n: persona.draft.version_number })}
        </Badge>
        <StatusBadge status={persona.draft.status} />
        {persona.published && (
          <Badge>
            {t("status.published")} · v{persona.published.version_number}
          </Badge>
        )}
        <span className="text-sm text-muted-foreground">/p/{persona.slug}</span>
      </div>

      {isPublishedLatest && (
        <Alert>
          <AlertDescription>{t("persona.newVersionNotice")}</AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="examples">
        <TabsList>
          <TabsTrigger value="settings">{t("persona.tabs.settings")}</TabsTrigger>
          <TabsTrigger value="examples">
            {t("persona.tabs.examples")} ({persona.draft.examples.length})
          </TabsTrigger>
        </TabsList>
        <TabsContent value="settings" className="pt-4">
          <SettingsForm
            key={persona.draft.id}
            persona={persona}
            busy={busy}
            onSave={async (patch: PersonaUpdate) => {
              await run(() => api.PATCH("/api/personas/{persona_id}", { ...path, body: patch }));
            }}
          />
        </TabsContent>
        <TabsContent value="examples" className="pt-4">
          <ExamplesPanel
            examples={persona.draft.examples}
            busy={busy}
            onAdd={(data: ExampleCreate) =>
              run(() => api.POST("/api/personas/{persona_id}/examples", { ...path, body: data }))
            }
            onUpdate={(exampleId: string, data: ExampleUpdate) =>
              run(() =>
                api.PATCH("/api/personas/{persona_id}/examples/{example_id}", {
                  params: { path: { persona_id: id, example_id: exampleId } },
                  body: data,
                }),
              )
            }
            onDelete={(exampleId: string) =>
              run(() =>
                api.DELETE("/api/personas/{persona_id}/examples/{example_id}", {
                  params: { path: { persona_id: id, example_id: exampleId } },
                }),
              )
            }
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function PersonaEditorPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations("common");
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8">
      <Link href="/studio" className="text-sm text-muted-foreground hover:text-foreground">
        ← {t("back")}
      </Link>
      <RequireAuth>
        <Editor id={id} />
      </RequireAuth>
    </main>
  );
}
