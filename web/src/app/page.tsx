import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { ApiStatus } from "@/components/api-status";
import { Button } from "@/components/ui/button";

export default async function Home() {
  const t = await getTranslations("app");
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 px-4 py-12">
      <header className="flex flex-col gap-3">
        <h1 className="text-3xl font-semibold">{t("name")}</h1>
        <p className="text-muted-foreground">{t("tagline")}</p>
        <div>
          <Button nativeButton={false} render={<Link href="/studio" />}>{t("studio")}</Button>
        </div>
      </header>
      <ApiStatus />
    </main>
  );
}
