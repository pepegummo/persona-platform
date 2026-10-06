import { Info, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { PublicChat } from "@/components/chat/public-chat";
import { ReportDialog } from "@/components/chat/report-dialog";
import { PersonaAvatar } from "@/components/persona-avatar";
import { Badge } from "@/components/ui/badge";
import { API_URL, type Schemas } from "@/lib/api/client";

type PublicPersona = Schemas["PublicPersonaOut"];

async function loadPersona(slug: string): Promise<PublicPersona | null> {
  const res = await fetch(`${API_URL}/api/public/p/${encodeURIComponent(slug)}`, {
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`api ${res.status}`);
  return (await res.json()) as PublicPersona;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const persona = await loadPersona(slug);
  if (!persona) return { title: "Persona Platform" };
  const title = `${persona.label} · Persona Platform`;
  const description = persona.description ?? undefined;
  // The link preview friends see in LINE / X / Messenger, so it carries the AI label too.
  return { title, description, openGraph: { title, description, type: "profile" } };
}

export default async function PublicPersonaPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const persona = await loadPersona(slug);
  if (!persona) notFound();
  const t = await getTranslations("public");

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 py-5 sm:px-6 sm:py-8">
      <header className="flex flex-wrap items-center gap-3 rounded-2xl border bg-card p-4 sm:gap-4 sm:p-5">
        <PersonaAvatar
          name={persona.display_name}
          seed={persona.slug}
          className="sm:size-16 sm:text-2xl"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="mr-1 text-xl font-bold sm:text-2xl">{persona.display_name}</h1>
            {/* Hard rule 5: always visible on every public chat */}
            <Badge data-testid="ai-label" variant="accent" className="h-7 px-3 text-[13px]">
              <Sparkles aria-hidden="true" />
              {t("label", { name: persona.display_name })}
            </Badge>
          </div>
          {persona.description && <p className="text-muted-foreground">{persona.description}</p>}
        </div>
        <div className="self-start">
          <ReportDialog slug={persona.slug} />
        </div>
        <p className="flex basis-full items-start gap-2 rounded-xl bg-muted px-3 py-2 text-[13px] text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            {t("notReal")} · {persona.owner_can_read_chats ? t("ownerCanRead") : t("ownerCannotRead")}
          </span>
        </p>
      </header>

      <div className="flex min-h-[420px] flex-1 flex-col">
        <PublicChat slug={persona.slug} name={persona.display_name} />
      </div>

      <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-2xl bg-secondary px-4 py-3 text-center text-sm">
        <span className="font-semibold">{t("ctaTitle")}</span>
        <Link href="/studio/new" className="font-semibold text-accent-foreground underline-offset-4 hover:underline">
          {t("ctaLink")}
        </Link>
      </p>
    </main>
  );
}
