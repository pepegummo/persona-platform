"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { ExamplesPanel } from "@/components/persona/examples-panel";
import { SettingsForm } from "@/components/persona/settings-form";
import { StyleCardPanel } from "@/components/persona/style-card-panel";
import { RequireAuth } from "@/components/require-auth";
import { StatusBadge } from "@/components/status-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

const POLL_MS = 2000;

function Editor({ id }: { id: string }) {
  const t = useTranslations();
  const api = useApi();
  const [persona, setPersona] = useState<Persona | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lastStatus = useRef<string | null>(null);

  // Pure fetch (no state updates) so effects can call it without tripping the React compiler lint.
  const fetchPersona = useCallback(
    () => api.GET("/api/personas/{persona_id}", { params: { path: { persona_id: id } } }),
    [api, id],
  );

  const reload = useCallback(async () => {
    const { data, error } = await fetchPersona();
    if (data) setPersona(data);
    else setError(errorMessage(error));
  }, [fetchPersona]);

  useEffect(() => {
    let cancelled = false;
    void fetchPersona().then(({ data, error }) => {
      if (cancelled) return;
      if (data) setPersona(data);
      else setError(errorMessage(error));
    });
    return () => {
      cancelled = true;
    };
  }, [fetchPersona]);

  // Poll while the worker compiles; announce the outcome once.
  const status = persona?.draft.status;
  useEffect(() => {
    if (status !== "compiling") {
      if (lastStatus.current === "compiling" && status) {
        toast[status === "ready" ? "success" : "error"](
          t(status === "ready" ? "persona.compile.done" : "persona.compile.failed"),
        );
      }
      lastStatus.current = status ?? null;
      return;
    }
    lastStatus.current = "compiling";
    const timer = window.setInterval(() => {
      void fetchPersona().then(({ data }) => {
        if (data) setPersona(data);
      });
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [status, fetchPersona, t]);

  async function run(op: () => Promise<{ error?: unknown }>, notify = true): Promise<boolean> {
    setBusy(true);
    const { error } = await op();
    if (error) {
      toast.error(errorMessage(error, t("common.error")));
      setBusy(false);
      return false;
    }
    await reload();
    setBusy(false);
    if (notify) toast.success(t("common.saved"));
    return true;
  }

  const path = { params: { path: { persona_id: id } } };

  if (error) return <p className="text-destructive">{error}</p>;
  if (!persona) return <Skeleton className="h-64 w-full" />;

  const draft = persona.draft;
  const isPublishedLatest =
    persona.published_version_id !== null && persona.published_version_id === draft.id;
  const compiling = draft.status === "compiling";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">{draft.display_name}</h1>
        <Badge variant="outline">{t("status.version", { n: draft.version_number })}</Badge>
        <StatusBadge status={draft.status} />
        {persona.published && (
          <Badge>
            {t("status.published")} · v{persona.published.version_number}
          </Badge>
        )}
        <span className="text-sm text-muted-foreground">/p/{persona.slug}</span>
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="secondary"
            disabled={busy || compiling || isPublishedLatest || draft.examples.length === 0}
            onClick={() => void run(() => api.POST("/api/personas/{persona_id}/compile", path), false)}
          >
            {compiling ? t("persona.compile.compiling") : t("persona.compile.button")}
          </Button>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">{t("persona.compile.hint")}</p>

      {isPublishedLatest && (
        <Alert>
          <AlertDescription>{t("persona.newVersionNotice")}</AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="examples">
        <TabsList>
          <TabsTrigger value="settings">{t("persona.tabs.settings")}</TabsTrigger>
          <TabsTrigger value="examples">
            {t("persona.tabs.examples")} ({draft.examples.length})
          </TabsTrigger>
          <TabsTrigger value="style">{t("persona.compile.styleCard")}</TabsTrigger>
        </TabsList>
        <TabsContent value="settings" className="pt-4">
          <SettingsForm
            key={draft.id}
            persona={persona}
            busy={busy}
            onSave={async (patch: PersonaUpdate) => {
              await run(() => api.PATCH("/api/personas/{persona_id}", { ...path, body: patch }));
            }}
          />
        </TabsContent>
        <TabsContent value="examples" className="pt-4">
          <ExamplesPanel
            examples={draft.examples}
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
        <TabsContent value="style" className="pt-4">
          <StyleCardPanel card={draft.style_card} fixedCount={draft.fixed_example_ids.length} />
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
