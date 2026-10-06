"use client";

import { Check, Copy } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

type Props = Omit<React.ComponentProps<typeof Button>, "onClick" | "children"> & {
  url: string;
  label?: string;
};

/** Copies `url`; the icon flips to a check for a moment so the result is visible without the toast. */
export function CopyLinkButton({ url, label, ...props }: Props) {
  const t = useTranslations("common");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(id);
  }, [copied]);

  return (
    <Button
      {...props}
      onClick={() => {
        navigator.clipboard.writeText(url).then(
          () => {
            setCopied(true);
            toast.success(t("copied"));
          },
          () => toast.error(t("copyFailed")),
        );
      }}
    >
      {copied ? (
        <Check data-icon="inline-start" aria-hidden="true" />
      ) : (
        <Copy data-icon="inline-start" aria-hidden="true" />
      )}
      {label ?? t("copyLink")}
    </Button>
  );
}
