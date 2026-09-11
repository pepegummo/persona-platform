import Link from "next/link";
import { getTranslations } from "next-intl/server";

export async function SiteFooter() {
  const t = await getTranslations("footer");
  return (
    <footer className="mt-12 border-t">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-4 px-4 py-4 text-xs text-muted-foreground">
        <span>{t("aiNotice")}</span>
        <span className="ml-auto flex gap-4">
          <Link href="/privacy" className="hover:text-foreground">
            {t("privacy")}
          </Link>
          <Link href="/terms" className="hover:text-foreground">
            {t("terms")}
          </Link>
        </span>
      </div>
    </footer>
  );
}
