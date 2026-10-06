"use client";

import { SignInButton } from "@clerk/nextjs";
import { LogIn } from "lucide-react";
import { useTranslations } from "next-intl";

import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuthState } from "@/lib/auth/context";

/** Renders children only for a signed-in user; otherwise a sign-in prompt. */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const t = useTranslations("auth");
  const auth = useAuthState();
  if (!auth.isLoaded) return <Skeleton className="h-40 w-full rounded-2xl" />;
  if (!auth.isSignedIn) {
    return (
      <EmptyState
        icon={LogIn}
        title={t("signInRequired")}
        action={
          auth.mode === "clerk" && (
            <SignInButton mode="modal">
              <Button size="lg">{t("signIn")}</Button>
            </SignInButton>
          )
        }
      />
    );
  }
  return <>{children}</>;
}
