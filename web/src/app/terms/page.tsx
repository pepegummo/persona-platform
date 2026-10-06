import { getTranslations } from "next-intl/server";

import { LegalPage } from "@/components/legal-page";

export default async function TermsPage() {
  const t = await getTranslations("legal");
  const sections = ["service", "personas", "content", "ai", "liability", "changes"] as const;
  return (
    <LegalPage
      title={t("terms.title")}
      updated={t("terms.updated")}
      contentsLabel={t("contents")}
      sections={sections.map((s) => ({
        id: s,
        title: t(`terms.${s}.title`),
        body: t(`terms.${s}.body`),
      }))}
    />
  );
}
