"use client";

import { SignInButton } from "@clerk/nextjs";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuthState } from "@/lib/auth/context";

/** Renders children only for a signed-in user; otherwise a sign-in prompt. */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const t = useTranslations("auth");
  const auth = useAuthState();
  if (!auth.isLoaded) return <Skeleton className="h-24 w-full" />;
  if (!auth.isSignedIn) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-lg border p-6">
        <p>{t("signInRequired")}</p>
        {auth.mode === "clerk" && (
          <SignInButton mode="modal">
            <Button>{t("signIn")}</Button>
          </SignInButton>
        )}
      </div>
    );
  }
  return <>{children}</>;
}
