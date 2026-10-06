import { getTranslations } from "next-intl/server";

import { LegalPage } from "@/components/legal-page";

export default async function PrivacyPage() {
  const t = await getTranslations("legal");
  const sections = ["collect", "providers", "examples", "visitors", "retention", "rights"] as const;
  return (
    <LegalPage
      title={t("privacy.title")}
      updated={t("privacy.updated")}
      contentsLabel={t("contents")}
      sections={sections.map((s) => ({
        id: s,
        title: t(`privacy.${s}.title`),
        body: t(`privacy.${s}.body`),
      }))}
    />
  );
}
