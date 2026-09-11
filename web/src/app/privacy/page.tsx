import { getTranslations } from "next-intl/server";

export default async function PrivacyPage() {
  const t = await getTranslations("legal.privacy");
  const sections = ["collect", "providers", "examples", "visitors", "retention", "rights"] as const;
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="text-sm text-muted-foreground">{t("updated")}</p>
      {sections.map((s) => (
        <section key={s} className="mt-6">
          <h2 className="text-lg font-medium">{t(`${s}.title`)}</h2>
          <p className="mt-2 whitespace-pre-line text-sm leading-6">{t(`${s}.body`)}</p>
        </section>
      ))}
    </main>
  );
}
