import Link from "next/link";
import { getTranslations } from "next-intl/server";

export async function SiteFooter() {
  const t = await getTranslations("footer");
  return (
    <footer className="mt-16 border-t">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-6 text-sm text-muted-foreground sm:px-6">
        <span>{t("aiNotice")}</span>
        <span className="flex gap-5 sm:ml-auto">
          <Link href="/privacy" className="underline-offset-4 hover:text-foreground hover:underline">
            {t("privacy")}
          </Link>
          <Link href="/terms" className="underline-offset-4 hover:text-foreground hover:underline">
            {t("terms")}
          </Link>
        </span>
      </div>
    </footer>
  );
}
