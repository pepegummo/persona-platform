"use client";

import { useEffect } from "react";

import { ChatPanel } from "@/components/chat/chat-panel";
import { API_URL } from "@/lib/api/client";

export function PublicChat({ slug }: { slug: string }) {
  const base = `${API_URL}/api/public/p/${encodeURIComponent(slug)}`;

  // share_link_opened: sets the visitor cookie and records one open per page view.
  useEffect(() => {
    void fetch(`${base}/open`, { method: "POST", credentials: "include" }).catch(() => undefined);
  }, [base]);

  return <ChatPanel url={`${base}/chat`} />;
}
