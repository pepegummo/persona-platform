"use client";

import { ArrowLeft, ExternalLink, Loader2, Sparkles } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { ChatPanel } from "@/components/chat/chat-panel";
import { CopyLinkButton } from "@/components/copy-link-button";
import { PersonaAvatar } from "@/components/persona-avatar";
import { ExamplesPanel } from "@/components/persona/examples-panel";
import { PublishPanel } from "@/components/persona/publish-panel";
import { SettingsForm } from "@/components/persona/settings-form";
import { SetupChecklist } from "@/components/persona/setup-checklist";
import { StyleCardPanel } from "@/components/persona/style-card-panel";
import { RequireAuth } from "@/components/require-auth";
import { StatusBadge } from "@/components/status-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  API_URL,
  errorMessage,
  type ExampleCreate,
  type ExampleUpdate,
  type Persona,
  type PersonaUpdate,
} from "@/lib/api/client";
import { useApi } from "@/lib/api/use-api";
import { useAuthState } from "@/lib/auth/context";
import { type EditorTab, setupChecklist } from "@/lib/persona-progress";
import { displayUrl, shareUrl } from "@/lib/share";

const POLL_MS = 2000;

const TAB_TRIGGER =
  "h-10 flex-none px-4 text-[15px] data-active:font-semibold data-active:shadow-sm";

function EditorSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <div className="flex items-center gap-4">
        <Skeleton className="size-16 rounded-full" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
      </div>
      <div className="flex flex-wrap gap-6">
        <Skeleton className="h-80 flex-[1_1_280px] rounded-2xl" />
        <Skeleton className="h-80 flex-[999_1_560px] rounded-2xl" />
      </div>
    </div>
  );
}

function Editor({ id }: { id: string }) {
  const t = useTranslations();
  const api = useApi();
  const { getToken } = useAuthState();
  const [persona, setPersona] = useState<Persona | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<EditorTab>("examples");
  const lastStatus = useRef<string | null>(null);
  const tabsRef = useRef<HTMLDivElement>(null);

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

  function goTo(next: EditorTab) {
    setTab(next);
    // On phones the checklist sits above the tabs; bring the opened tab into view.
    tabsRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }

  const path = { params: { path: { persona_id: id } } };

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }
  if (!persona) return <EditorSkeleton />;

  const draft = persona.draft;
  const isPublishedLatest =
    persona.published_version_id !== null && persona.published_version_id === draft.id;
  const live = persona.published !== null && persona.visibility !== "private";
  const compiling = draft.status === "compiling";
  const compileBlocked = draft.examples.length === 0 ? "noExamples" : isPublishedLatest ? "upToDate" : null;
  const checklist = setupChecklist(persona);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-4">
        <PersonaAvatar name={draft.display_name} seed={persona.slug} size="lg" />
        <div className="flex min-w-0 flex-[1_1_280px] flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="mr-1 text-3xl font-bold tracking-tight">{draft.display_name}</h1>
            <Badge variant="outline">{t("status.version", { n: draft.version_number })}</Badge>
            <StatusBadge status={draft.status} />
            {persona.published && (
              <StatusBadge status="published" />
            )}
          </div>
          <p className="truncate text-sm text-muted-foreground">
            {displayUrl(persona.slug)}
            {persona.published && (
              <> · {t("persona.header.liveVersion", { n: persona.published.version_number })}</>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {live && (
            <>
              <CopyLinkButton variant="outline" url={shareUrl(persona.slug)} />
              <Button
                variant="ghost"
                size="icon"
                aria-label={t("persona.header.openPublic")}
                title={t("persona.header.openPublic")}
                nativeButton={false}
                render={<a href={`/p/${persona.slug}`} target="_blank" rel="noreferrer" />}
              >
                <ExternalLink aria-hidden="true" />
              </Button>
            </>
          )}
          <div className="flex flex-col items-end gap-1">
            <Button
              size="lg"
              variant={draft.status === "ready" ? "outline" : "default"}
              disabled={busy || compiling || compileBlocked !== null}
              aria-describedby="compile-hint"
              onClick={() => void run(() => api.POST("/api/personas/{persona_id}/compile", path), false)}
            >
              {compiling ? (
                <Loader2 data-icon="inline-start" className="motion-safe:animate-spin" aria-hidden="true" />
              ) : (
                <Sparkles data-icon="inline-start" aria-hidden="true" />
              )}
              {compiling ? t("persona.compile.compiling") : t("persona.compile.button")}
            </Button>
            <span id="compile-hint" className="max-w-64 text-right text-xs text-muted-foreground">
              {compileBlocked ? t(`persona.compile.${compileBlocked}`) : t("persona.compile.short")}
            </span>
          </div>
        </div>
      </div>

      {isPublishedLatest && (
        <Alert>
          <AlertDescription>{t("persona.newVersionNotice")}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-start gap-6">
        <SetupChecklist
          items={checklist}
          onGo={goTo}
          className="min-w-0 flex-[1_1_280px] lg:sticky lg:top-20 lg:max-w-[340px]"
        />

        <div ref={tabsRef} className="min-w-0 flex-[999_1_560px] scroll-mt-20">
          <Tabs value={tab} onValueChange={(v) => setTab(v as EditorTab)}>
            <TabsList className="max-w-full justify-start overflow-x-auto rounded-xl bg-secondary p-1 group-data-horizontal/tabs:h-auto">
              <TabsTrigger value="settings" className={TAB_TRIGGER}>
                {t("persona.tabs.settings")}
              </TabsTrigger>
              <TabsTrigger value="examples" className={TAB_TRIGGER}>
                {t("persona.tabs.examples")}
                <span className="font-normal text-muted-foreground">{draft.examples.length}</span>
              </TabsTrigger>
              <TabsTrigger value="style" className={TAB_TRIGGER}>
                {t("persona.compile.styleCard")}
              </TabsTrigger>
              <TabsTrigger value="test" className={TAB_TRIGGER}>
                {t("persona.tabs.test")}
              </TabsTrigger>
              <TabsTrigger value="publish" className={TAB_TRIGGER}>
                {t("persona.tabs.publish")}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="settings" className="pt-5 text-base">
              <SettingsForm
                key={draft.id}
                persona={persona}
                busy={busy}
                onSave={(patch: PersonaUpdate) =>
                  run(() => api.PATCH("/api/personas/{persona_id}", { ...path, body: patch }))
                }
              />
            </TabsContent>
            <TabsContent value="examples" className="pt-5 text-base">
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
            <TabsContent value="style" className="pt-5 text-base">
              <StyleCardPanel card={draft.style_card} fixedCount={draft.fixed_example_ids.length} />
            </TabsContent>
            <TabsContent value="test" className="flex flex-col gap-3 pt-5 text-base">
              <p className="text-sm text-muted-foreground">{t("persona.test.hint")}</p>
              {draft.status === "ready" ? (
                <ChatPanel
                  key={draft.id}
                  url={`${API_URL}/api/personas/${id}/test-chat`}
                  persona={{ name: draft.display_name, seed: persona.slug }}
                  headers={async (): Promise<Record<string, string>> => {
                    const token = await getToken();
                    return token ? { Authorization: `Bearer ${token}` } : {};
                  }}
                />
              ) : (
                <Alert>
                  <AlertDescription>{t("persona.test.needCompile")}</AlertDescription>
                </Alert>
              )}
            </TabsContent>
            <TabsContent value="publish" className="pt-5 text-base">
              <PublishPanel
                key={`${persona.published_version_id}-${persona.visibility}`}
                persona={persona}
                busy={busy}
                onPublish={(visibility) =>
                  run(() =>
                    api.POST("/api/personas/{persona_id}/publish", { ...path, body: { visibility } }),
                  )
                }
                onUnpublish={() => run(() => api.POST("/api/personas/{persona_id}/unpublish", path))}
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

export default function PersonaEditorPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations("common");
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
      <Link
        href="/studio"
        className="inline-flex items-center gap-1.5 self-start rounded-md text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        {t("backToStudio")}
      </Link>
      <RequireAuth>
        <Editor id={id} />
      </RequireAuth>
    </main>
  );
}
