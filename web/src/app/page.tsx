import { ArrowRight, MessageSquareText, Share2, ShieldCheck, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { ApiStatus } from "@/components/api-status";
import { PersonaAvatar } from "@/components/persona-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const STEPS = [
  { key: "settings", icon: SlidersHorizontal },
  { key: "examples", icon: MessageSquareText },
  { key: "share", icon: Share2 },
] as const;

/** A static picture of the public chat, so visitors see the product before signing in. */
async function ChatPreview() {
  const t = await getTranslations("home.preview");
  const tp = await getTranslations("public");
  const name = t("name");
  return (
    <figure
      aria-label={t("label")}
      className="mx-auto w-full max-w-[500px] overflow-hidden rounded-3xl border bg-card shadow-[0_24px_48px_-24px_rgb(122_62_30/0.3)]"
    >
      <div className="flex items-center gap-3 border-b px-4 py-3.5">
        <PersonaAvatar name={name} seed="mew-dev" size="sm" />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="font-semibold">{name}</p>
          <p className="truncate text-sm text-muted-foreground">{t("role")}</p>
        </div>
        <Badge variant="accent">{tp("label", { name })}</Badge>
      </div>
      <div className="flex flex-col gap-3 bg-background/40 p-4">
        <p className="max-w-[80%] self-end rounded-[18px_18px_4px_18px] bg-primary px-3.5 py-2.5 text-[15px] text-primary-foreground">
          {t("question")}
        </p>
        <p className="max-w-[88%] self-start whitespace-pre-line rounded-[18px_18px_18px_4px] bg-muted px-3.5 py-3 text-[15px]">
          {t("answer")}
        </p>
      </div>
    </figure>
  );
}

export default async function Home() {
  const t = await getTranslations("home");
  return (
    <main>
      <section className="mx-auto flex max-w-6xl flex-wrap items-center gap-14 px-4 pt-14 pb-12 sm:px-6 sm:pt-20">
        <div className="flex min-w-0 flex-[1_1_420px] flex-col gap-5">
          <Badge variant="accent" className="h-8 px-3.5 text-sm">
            {t("badge")}
          </Badge>
          <h1 className="text-4xl font-bold tracking-tight text-balance sm:text-5xl">{t("title")}</h1>
          <p className="max-w-xl text-lg text-muted-foreground">{t("subtitle")}</p>
          <div className="flex flex-wrap gap-3 pt-2">
            <Button size="lg" nativeButton={false} render={<Link href="/studio/new" />}>
              {t("ctaCreate")}
              <ArrowRight data-icon="inline-end" aria-hidden="true" />
            </Button>
            <Button size="lg" variant="outline" nativeButton={false} render={<a href="#how" />}>
              {t("ctaHow")}
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">{t("note")}</p>
        </div>
        <div className="min-w-0 flex-[1_1_400px]">
          <ChatPreview />
        </div>
      </section>

      <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-12 sm:px-6">
        <h2 className="text-3xl font-bold">{t("steps.title")}</h2>
        <p className="mt-1 text-lg text-muted-foreground">{t("steps.subtitle")}</p>
        <ol className="mt-8 grid gap-5 sm:grid-cols-3">
          {STEPS.map(({ key, icon: Icon }, i) => (
            <li key={key} className="flex flex-col gap-3 rounded-2xl border bg-card p-6">
              <div className="flex items-center gap-3">
                <span className="flex size-11 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <span className="text-sm font-semibold text-accent-foreground">
                  {t("steps.label", { n: i + 1 })}
                </span>
              </div>
              <h3 className="text-xl font-semibold">{t(`steps.${key}.title`)}</h3>
              <p className="text-muted-foreground">{t(`steps.${key}.body`)}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {/* Always-dark band in both themes: a quiet, trustworthy moment between the steps and the CTA. */}
        <div className="flex flex-wrap items-center gap-6 rounded-3xl bg-[#2a211c] p-8 text-[#f6eee7] sm:p-10 dark:bg-card">
          <span className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-white/10">
            <ShieldCheck className="size-8 text-[#f0a487]" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-[1_1_380px]">
            <h2 className="text-2xl font-bold">{t("privacy.title")}</h2>
            <p className="mt-1 text-[#d9cbbf]">{t("privacy.body")}</p>
          </div>
          <Link
            href="/privacy"
            className="font-semibold text-[#f0a487] underline-offset-4 hover:underline"
          >
            {t("privacy.link")}
          </Link>
        </div>
      </section>

      <section className="mx-auto flex max-w-6xl flex-col items-center gap-5 px-4 py-16 text-center sm:px-6">
        <h2 className="text-3xl font-bold text-balance">{t("final.title")}</h2>
        <Button size="lg" nativeButton={false} render={<Link href="/studio/new" />}>
          {t("final.cta")}
        </Button>
      </section>

      {process.env.NODE_ENV !== "production" && (
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <ApiStatus />
        </div>
      )}
    </main>
  );
}
