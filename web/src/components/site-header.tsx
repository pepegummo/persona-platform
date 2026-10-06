"use client";

import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";

import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { setLocale } from "@/i18n/actions";
import { locales } from "@/i18n/config";
import { useAuthState } from "@/lib/auth/context";
import { cn } from "@/lib/utils";

function LocaleSwitcher() {
  const t = useTranslations("app");
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <div role="group" aria-label={t("language")} className="flex rounded-full bg-secondary p-1">
      {locales.map((l) => (
        <button
          key={l}
          type="button"
          aria-pressed={l === locale}
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await setLocale(l);
              router.refresh();
            })
          }
          className={cn(
            "h-8 min-w-10 rounded-full px-2.5 text-xs font-semibold outline-none transition-colors",
            "focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60",
            l === locale
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {l.toUpperCase()}
        </button>
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
            <Button>{t("signIn")}</Button>
          </SignInButton>
        </SignedOut>
      </>
    );
  }
  return (
    <div
      className="hidden items-center gap-2 text-xs text-muted-foreground md:flex"
      title={t("devMode")}
    >
      <span>{t("devUser")}</span>
      <Input
        className="h-9 w-28 text-sm"
        defaultValue={auth.devUser}
        onBlur={(e) => auth.setDevUser?.(e.target.value)}
        aria-label={t("devUser")}
      />
    </div>
  );
}

export function SiteHeader() {
  const t = useTranslations("app");
  const pathname = usePathname();
  const inStudio = pathname.startsWith("/studio");
  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5 sm:gap-4 sm:px-6">
        <Logo name={t("name")} />
        <nav className="flex items-center">
          <Link
            href="/studio"
            aria-current={inStudio ? "page" : undefined}
            className={cn(
              "rounded-lg px-3 py-2 text-[15px] outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
              inStudio
                ? "bg-secondary font-semibold text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t("studio")}
          </Link>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <LocaleSwitcher />
          <ThemeToggle />
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
