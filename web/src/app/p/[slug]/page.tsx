import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { PublicChat } from "@/components/chat/public-chat";
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
  return { title: persona ? `${persona.label} · Persona Platform` : "Persona Platform" };
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
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{persona.display_name}</h1>
          {/* Hard rule 5: always visible on every public chat */}
          <Badge data-testid="ai-label">{t("label", { name: persona.display_name })}</Badge>
        </div>
        {persona.description && <p className="text-muted-foreground">{persona.description}</p>}
        <p className="text-xs text-muted-foreground">{t("disclaimer")}</p>
        {persona.owner_can_read_chats ? (
          <p className="text-xs text-muted-foreground">{t("ownerCanRead")}</p>
        ) : (
          <p className="text-xs text-muted-foreground">{t("ownerCannotRead")}</p>
        )}
      </header>
      <PublicChat slug={persona.slug} />
    </main>
  );
}
