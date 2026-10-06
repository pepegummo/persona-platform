import { MessageCircle } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-9 items-center justify-center rounded-[10px] bg-primary text-primary-foreground",
        className,
      )}
    >
      <MessageCircle className="size-5" strokeWidth={2.2} />
    </span>
  );
}

/** Logo + wordmark linking home. The wordmark hides on very narrow screens. */
export function Logo({ name }: { name: string }) {
  return (
    <Link
      href="/"
      className="flex items-center gap-2.5 rounded-lg text-lg font-bold outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <LogoMark />
      <span className="hidden sm:inline">{name}</span>
      <span className="sr-only sm:hidden">{name}</span>
    </Link>
  );
}
