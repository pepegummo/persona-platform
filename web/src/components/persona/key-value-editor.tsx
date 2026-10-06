"use client";

import { PlusIcon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Mirrors KV_MAX_* in api/app/schemas/persona.py.
export const KV_MAX_ENTRIES = 30;
export const KV_MAX_KEY = 40;
export const KV_MAX_VALUE = 200;

type Row = { id: number; key: string; value: string };

type Props = {
  id: string;
  value: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
  keyPlaceholder: string;
  valuePlaceholder: string;
  /** Quick-add chips: clicking one adds a row with that key (once). */
  suggestions?: string[];
  disabled?: boolean;
};

let nextId = 1;

function toRows(value: Record<string, string>): Row[] {
  return Object.entries(value).map(([key, v]) => ({ id: nextId++, key, value: v }));
}

/** Rows with an empty key are still being typed and are not part of the map yet. */
function toMap(rows: Row[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of rows) {
    const key = r.key.trim();
    if (key) out[key] = r.value.trim();
  }
  return out;
}

/**
 * Ordered key → value editor for `settings.profile` and `settings.vocabulary`.
 * Keeps rows locally so a user can type a key before its value; emits the map on every change.
 */
export function KeyValueEditor({
  id,
  value,
  onChange,
  keyPlaceholder,
  valuePlaceholder,
  suggestions = [],
  disabled,
}: Props) {
  const t = useTranslations("persona.kv");
  const [rows, setRows] = useState<Row[]>(() => toRows(value));

  function commit(next: Row[]) {
    setRows(next);
    onChange(toMap(next));
  }

  function addRow(key = "") {
    if (rows.length >= KV_MAX_ENTRIES) return;
    commit([...rows, { id: nextId++, key, value: "" }]);
  }

  function update(rowId: number, field: "key" | "value", text: string) {
    commit(rows.map((r) => (r.id === rowId ? { ...r, [field]: text } : r)));
  }

  function remove(rowId: number) {
    commit(rows.filter((r) => r.id !== rowId));
  }

  const usedKeys = new Set(rows.map((r) => r.key.trim()));
  const full = rows.length >= KV_MAX_ENTRIES;
  const duplicateKeys = new Set(
    rows
      .map((r) => r.key.trim())
      .filter((k, i, all) => k && all.indexOf(k) !== i),
  );

  return (
    <div className="flex flex-col gap-3">
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <Button
              key={s}
              type="button"
              variant="outline"
              size="xs"
              disabled={disabled || full || usedKeys.has(s)}
              onClick={() => addRow(s)}
            >
              <PlusIcon />
              {s}
            </Button>
          ))}
        </div>
      )}

      {rows.length > 0 && (
        <ul className="flex flex-col gap-2">
          {rows.map((r) => {
            const dup = duplicateKeys.has(r.key.trim());
            return (
              <li key={r.id} className="grid grid-cols-[1fr_2fr_auto] items-center gap-2">
                <Input
                  aria-label={keyPlaceholder}
                  aria-invalid={dup || undefined}
                  value={r.key}
                  onChange={(e) => update(r.id, "key", e.target.value)}
                  placeholder={keyPlaceholder}
                  maxLength={KV_MAX_KEY}
                  disabled={disabled}
                />
                <Input
                  aria-label={valuePlaceholder}
                  value={r.value}
                  onChange={(e) => update(r.id, "value", e.target.value)}
                  placeholder={valuePlaceholder}
                  maxLength={KV_MAX_VALUE}
                  disabled={disabled}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("remove")}
                  disabled={disabled}
                  onClick={() => remove(r.id)}
                >
                  <XIcon />
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex items-center gap-3">
        <Button
          id={id}
          type="button"
          variant="secondary"
          size="sm"
          disabled={disabled || full}
          onClick={() => addRow()}
        >
          <PlusIcon />
          {t("add")}
        </Button>
        <span className="text-xs text-muted-foreground">
          {t("counter", { n: rows.length, max: KV_MAX_ENTRIES })}
        </span>
        {duplicateKeys.size > 0 && (
          <span className="text-xs text-destructive">{t("duplicate")}</span>
        )}
      </div>
    </div>
  );
}
