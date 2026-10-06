import { SearchX } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";

export default async function NotFound() {
  const t = await getTranslations();
  return (
    <main className="mx-auto w-full max-w-xl px-4 py-20">
      <EmptyState
        icon={SearchX}
        title={t("notFound.title")}
        description={t("notFound.body")}
        action={
          <Button nativeButton={false} render={<Link href="/" />}>
            {t("common.goHome")}
          </Button>
        }
      />
    </main>
  );
}
