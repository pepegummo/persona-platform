"use client";

import { ChatPanel } from "@/components/chat/chat-panel";
import { API_URL } from "@/lib/api/client";

export function PublicChat({ slug }: { slug: string }) {
  return <ChatPanel url={`${API_URL}/api/public/p/${encodeURIComponent(slug)}/chat`} />;
}
