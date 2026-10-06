import type { Persona } from "@/lib/api/client";

/** The API refuses to publish with fewer public examples than this. */
export const MIN_PUBLIC_EXAMPLES = 3;

export type EditorTab = "settings" | "examples" | "style" | "test" | "publish";

export type ChecklistItem = {
  key: "basics" | "examples" | "public" | "compile" | "publish";
  done: boolean;
  /** Tab that fixes this item. */
  tab: EditorTab;
  /** Values for the item's "todo" message. */
  values?: Record<string, number>;
};

/** Setup steps derived from the persona the editor already loaded — no extra API call. */
export function setupChecklist(persona: Persona): ChecklistItem[] {
  const draft = persona.draft;
  const total = draft.examples.length;
  const pub = draft.examples.filter((e) => !e.is_private).length;
  return [
    { key: "basics", done: Boolean(draft.description?.trim()), tab: "settings" },
    {
      key: "examples",
      done: total >= MIN_PUBLIC_EXAMPLES,
      tab: "examples",
      values: { n: total, left: Math.max(0, MIN_PUBLIC_EXAMPLES - total) },
    },
    {
      key: "public",
      done: pub >= MIN_PUBLIC_EXAMPLES,
      tab: "examples",
      values: { n: pub, left: Math.max(0, MIN_PUBLIC_EXAMPLES - pub) },
    },
    { key: "compile", done: draft.status === "ready", tab: "test" },
    {
      key: "publish",
      done: persona.published_version_id === draft.id && persona.visibility !== "private",
      tab: "publish",
    },
  ];
}
