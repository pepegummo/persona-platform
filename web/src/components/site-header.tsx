"use client";

import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { setLocale } from "@/i18n/actions";
import { locales } from "@/i18n/config";
import { useAuthState } from "@/lib/auth/context";

function LocaleSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex items-center gap-1" aria-label="language">
      {locales.map((l) => (
        <Button
          key={l}
          size="sm"
          variant={l === locale ? "secondary" : "ghost"}
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await setLocale(l);
              router.refresh();
            })
          }
        >
          {l.toUpperCase()}
        </Button>
      ))}
    </div>
  );
}

function UserMenu() {
  const t = useTranslations("auth");
  const auth = useAuthState();
  if (auth.mode === "clerk") {
    return (
      <>
        <SignedIn>
          <UserButton />
        </SignedIn>
        <SignedOut>
          <SignInButton mode="modal">
            <Button size="sm">{t("signIn")}</Button>
          </SignInButton>
        </SignedOut>
      </>
    );
  }
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground" title={t("devMode")}>
      <span className="hidden sm:inline">{t("devUser")}</span>
      <Input
        className="h-8 w-28"
        defaultValue={auth.devUser}
        onBlur={(e) => auth.setDevUser?.(e.target.value)}
        aria-label={t("devUser")}
      />
    </div>
  );
}

export function SiteHeader() {
  const t = useTranslations("app");
  return (
    <header className="border-b">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
        <nav className="flex items-center gap-4">
          <Link href="/" className="font-semibold">
            {t("name")}
          </Link>
          <Link href="/studio" className="text-sm text-muted-foreground hover:text-foreground">
            {t("studio")}
          </Link>
        </nav>
        <div className="flex items-center gap-3">
          <LocaleSwitcher />
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
