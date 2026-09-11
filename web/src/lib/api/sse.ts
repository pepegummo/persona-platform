/** POST a chat message and iterate the api's SSE events (EventSource cannot POST). */

export type ChatEvent =
  | { event: "conversation"; conversation_id: string }
  | { event: "delta"; text: string }
  | { event: "done"; message_id: string }
  | { event: "blocked"; reason: string; message: string }
  | { event: "error"; message: string; status: number };

export class ChatHttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function* streamChat(
  url: string,
  body: { message: string; conversation_id?: string | null },
  init: { headers?: Record<string, string>; signal?: AbortSignal } = {},
): AsyncGenerator<ChatEvent> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream", ...init.headers },
    body: JSON.stringify(body),
    credentials: "include",
    signal: init.signal,
  });
  if (!res.ok || !res.body) {
    let detail = res.statusText;
    try {
      const json = (await res.json()) as { detail?: unknown };
      if (typeof json.detail === "string") detail = json.detail;
    } catch {
      // not JSON
    }
    throw new ChatHttpError(res.status, detail);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let eventName = "message";
  let data = "";

  const flush = (): ChatEvent | null => {
    if (!data) return null;
    const parsed = JSON.parse(data) as Record<string, unknown>;
    const out = { event: eventName, ...parsed } as ChatEvent;
    eventName = "message";
    data = "";
    return out;
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, idx).replace(/\r$/, "");
      buffer = buffer.slice(idx + 1);
      if (line.startsWith("event:")) eventName = line.slice(6).trim();
      else if (line.startsWith("data:")) data += line.slice(5).trim();
      else if (line === "") {
        const ev = flush();
        if (ev) yield ev;
      }
    }
  }
  const last = flush();
  if (last) yield last;
}
