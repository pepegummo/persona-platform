import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import type { Starter } from "@/components/chat/chat-panel";
import { PersonaRoom } from "@/components/chat/persona-room";
import { API_URL, type Schemas } from "@/lib/api/client";
import { roomFor } from "@/lib/room";

type PublicPersona = Schemas["PublicPersonaOut"];
type PublicExample = Schemas["PublicExampleOut"];

const SAMPLE_MAX = 280;
const STARTER_MAX = 48;

async function loadPersona(slug: string): Promise<PublicPersona | null> {
  const res = await fetch(`${API_URL}/api/public/p/${encodeURIComponent(slug)}`, {
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`api ${res.status}`);
  return (await res.json()) as PublicPersona;
}

/** Public examples only (the API never returns private ones). The page works without them. */
async function loadExamples(slug: string): Promise<PublicExample[]> {
  try {
    const res = await fetch(`${API_URL}/api/public/p/${encodeURIComponent(slug)}/examples`, {
      cache: "no-store",
    });
    return res.ok ? ((await res.json()) as PublicExample[]) : [];
  } catch {
    return [];
  }
}

/** Shorten by grapheme, so a Thai vowel or tone mark is never cut off its consonant. */
function clip(text: string, max: number): string {
  const parts = Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text));
  if (parts.length <= max) return text;
  return `${parts
    .slice(0, max - 1)
    .map((p) => p.segment)
    .join("")
    .trimEnd()}…`;
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
  const [persona, examples] = await Promise.all([loadPersona(slug), loadExamples(slug)]);
  if (!persona) notFound();
  const t = await getTranslations("public");

  const sample = examples.find((e) => e.answer.trim().length <= SAMPLE_MAX) ?? null;
  // The sample is already on screen, so its question would only repeat it as a starter.
  const starters: Starter[] = [...new Set(examples.map((e) => e.question.trim()))]
    .filter((q) => q && q !== sample?.question.trim())
    .slice(0, 3)
    .map((q) => ({ label: clip(q, STARTER_MAX), text: q }));

  return (
    <main
      data-room={roomFor(persona.slug)}
      className="flex flex-1 flex-col bg-[color:var(--room-wall)] text-[color:var(--room-ink)]"
    >
      <PersonaRoom
        slug={persona.slug}
        name={persona.display_name}
        description={persona.description}
        ownerCanReadChats={persona.owner_can_read_chats}
        sample={sample ? { question: sample.question.trim(), answer: sample.answer.trim() } : null}
        starters={starters}
      />
      <p className="mx-auto w-full max-w-2xl px-4 pt-2 pb-10 text-sm text-[color:var(--room-soft)] sm:px-6">
        {t("ctaTitle")}{" "}
        <Link
          href="/studio/new"
          className="rounded-sm font-semibold text-[color:var(--room-ink)] underline decoration-[color:var(--room-mark)] decoration-2 underline-offset-4 outline-none focus-visible:ring-3 focus-visible:ring-[color:var(--room-tone)]/40"
        >
          {t("ctaLink")}
        </Link>
      </p>
    </main>
  );
}
