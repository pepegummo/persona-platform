"use client";

import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { NativeSelect } from "@/components/native-select";
import { KeyValueEditor } from "@/components/persona/key-value-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Persona, PersonaSettings, PersonaUpdate } from "@/lib/api/client";
import { cn } from "@/lib/utils";

const FORMATTING = ["bullets", "comparisons", "analogies", "headings", "code_blocks", "emoji"] as const;
const LANGUAGES = ["th", "en", "mixed"] as const;
const LENGTHS = ["short", "medium", "long"] as const;
const LEVELS = ["beginner", "intermediate", "expert"] as const;
const PROFILE_SUGGESTIONS = ["age", "zodiac", "color", "game", "book", "music"] as const;

type Props = {
  persona: Persona;
  busy: boolean;
  /** Resolves true when the save succeeded. */
  onSave: (patch: PersonaUpdate) => Promise<boolean>;
};

function FormCard({
  title,
  hint,
  titleFor,
  children,
}: {
  title: string;
  hint?: string;
  /** When the title labels a single control, pass its id. */
  titleFor?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4 rounded-2xl border bg-card p-5 sm:p-6">
      <div>
        {titleFor ? (
          <Label htmlFor={titleFor} className="text-lg font-semibold">
            {title}
          </Label>
        ) : (
          <h2 className="text-lg font-semibold">{title}</h2>
        )}
        {hint && <p className="mt-0.5 text-sm text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

export function SettingsForm({ persona, busy, onSave }: Props) {
  const t = useTranslations("persona.settings");
  const tp = useTranslations("persona");
  const tc = useTranslations("common");
  const draft = persona.draft;
  const [displayName, setDisplayName] = useState(draft.display_name);
  const [description, setDescription] = useState(draft.description ?? "");
  const [slug, setSlug] = useState(persona.slug);
  const [rules, setRules] = useState(draft.rules);
  const [mode, setMode] = useState(draft.mode);
  const [settings, setSettings] = useState<PersonaSettings>({
    language: draft.settings.language ?? "mixed",
    tone: draft.settings.tone ?? "",
    answer_length: draft.settings.answer_length ?? "medium",
    technical_level: draft.settings.technical_level ?? "intermediate",
    personality: draft.settings.personality ?? "",
    writing_style: draft.settings.writing_style ?? "",
    formatting: draft.settings.formatting ?? [],
    // The API replaces the whole settings object, so carry these through even when untouched.
    profile: draft.settings.profile ?? {},
    vocabulary: draft.settings.vocabulary ?? {},
  });

  const snapshot = JSON.stringify({ displayName, description, slug, rules, mode, settings });
  const [saved, setSaved] = useState(snapshot);
  const dirty = snapshot !== saved;

  function patch<K extends keyof PersonaSettings>(key: K, value: PersonaSettings[K]) {
    setSettings((s) => ({ ...s, [key]: value }));
  }

  function toggleFormatting(item: string) {
    const current = settings.formatting ?? [];
    patch("formatting", current.includes(item) ? current.filter((f) => f !== item) : [...current, item]);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const body: PersonaUpdate = {
      display_name: displayName.trim(),
      description: description.trim() || null,
      rules,
      mode,
      settings,
    };
    if (slug !== persona.slug) body.slug = slug;
    const at = snapshot;
    if (await onSave(body)) setSaved(at);
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      <FormCard title={tp("settingsTab.basics")} hint={tp("settingsTab.basicsHint")}>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field id="display_name" label={tp("displayName")}>
            <Input
              id="display_name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              maxLength={80}
            />
          </Field>
          <div className="flex flex-col gap-2">
            <Label htmlFor="slug">{tp("slug")}</Label>
            <Input
              id="slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase().trim())}
              pattern="[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?"
              required
              autoCapitalize="none"
              spellCheck={false}
              aria-describedby="slug_hint"
            />
            <p id="slug_hint" className="text-xs text-muted-foreground">
              {tp("slugHint")}
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label htmlFor="description">{tp("description")}</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              maxLength={1000}
            />
          </div>
        </div>
      </FormCard>

      <FormCard title={t("title")} hint={tp("settingsTab.styleHint")}>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          <Field id="language" label={t("language")}>
            <NativeSelect
              id="language"
              value={settings.language}
              onChange={(e) => patch("language", e.target.value as PersonaSettings["language"])}
            >
              {LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  {t(`languageOptions.${l}`)}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field id="answer_length" label={t("answerLength")}>
            <NativeSelect
              id="answer_length"
              value={settings.answer_length}
              onChange={(e) =>
                patch("answer_length", e.target.value as PersonaSettings["answer_length"])
              }
            >
              {LENGTHS.map((l) => (
                <option key={l} value={l}>
                  {t(`answerLengthOptions.${l}`)}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field id="technical_level" label={t("technicalLevel")}>
            <NativeSelect
              id="technical_level"
              value={settings.technical_level}
              onChange={(e) =>
                patch("technical_level", e.target.value as PersonaSettings["technical_level"])
              }
            >
              {LEVELS.map((l) => (
                <option key={l} value={l}>
                  {t(`technicalLevelOptions.${l}`)}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field id="tone" label={t("tone")}>
            <Input
              id="tone"
              value={settings.tone}
              onChange={(e) => patch("tone", e.target.value)}
              placeholder={t("toneHint")}
              maxLength={200}
            />
          </Field>
          <Field id="personality" label={t("personality")}>
            <Input
              id="personality"
              value={settings.personality}
              onChange={(e) => patch("personality", e.target.value)}
              maxLength={500}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field id="writing_style" label={t("writingStyle")}>
              <Input
                id="writing_style"
                value={settings.writing_style}
                onChange={(e) => patch("writing_style", e.target.value)}
                placeholder={t("writingStyleHint")}
                maxLength={500}
              />
            </Field>
          </div>
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium">{t("formatting")}</legend>
          <div className="flex flex-wrap gap-2">
            {FORMATTING.map((f) => {
              const on = (settings.formatting ?? []).includes(f);
              return (
                <button
                  key={f}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleFormatting(f)}
                  className={cn(
                    "inline-flex h-10 items-center gap-1.5 rounded-full border px-4 text-sm outline-none transition-colors",
                    "focus-visible:ring-3 focus-visible:ring-ring/50",
                    on
                      ? "border-primary bg-accent font-semibold text-accent-foreground"
                      : "bg-card hover:bg-muted",
                  )}
                >
                  {on && <Check className="size-4" aria-hidden="true" />}
                  {t(`formattingOptions.${f}`)}
                </button>
              );
            })}
          </div>
        </fieldset>
        <div className="max-w-sm">
          <Field id="mode" label={t("mode")}>
            <NativeSelect
              id="mode"
              value={mode}
              onChange={(e) => setMode(e.target.value as Persona["draft"]["mode"])}
            >
              <option value="simple">{t("modeSimple")}</option>
              <option value="like_me" disabled>
                {t("modeLikeMe")}
              </option>
            </NativeSelect>
          </Field>
        </div>
      </FormCard>

      <FormCard title={tp("profile.title")} hint={tp("profile.hint")} titleFor="profile-add">
        <KeyValueEditor
          id="profile-add"
          value={settings.profile ?? {}}
          onChange={(next) => patch("profile", next)}
          keyPlaceholder={tp("profile.keyPlaceholder")}
          valuePlaceholder={tp("profile.valuePlaceholder")}
          suggestions={PROFILE_SUGGESTIONS.map((k) => tp(`profile.suggestions.${k}`))}
          disabled={busy}
        />
      </FormCard>

      <FormCard title={tp("vocabulary.title")} hint={tp("vocabulary.hint")} titleFor="vocabulary-add">
        <KeyValueEditor
          id="vocabulary-add"
          value={settings.vocabulary ?? {}}
          onChange={(next) => patch("vocabulary", next)}
          keyPlaceholder={tp("vocabulary.keyPlaceholder")}
          valuePlaceholder={tp("vocabulary.valuePlaceholder")}
          disabled={busy}
        />
      </FormCard>

      <FormCard title={t("rules")} hint={tp("settingsTab.rulesHint")} titleFor="rules">
        <Textarea
          id="rules"
          value={rules}
          onChange={(e) => setRules(e.target.value)}
          placeholder={t("rulesHint")}
          rows={3}
          maxLength={4000}
        />
      </FormCard>

      {/* Sticky so Save stays reachable at the end of a long form, on phones too. */}
      <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card/95 px-4 py-3 shadow-[0_-8px_24px_-16px_rgb(42_33_28/0.25)] backdrop-blur">
        <p
          className={cn("text-sm", dirty ? "font-semibold text-accent-foreground" : "text-muted-foreground")}
          aria-live="polite"
        >
          {dirty ? tp("settingsTab.unsaved") : tp("settingsTab.allSaved")}
        </p>
        <Button type="submit" disabled={busy || !dirty}>
          {busy ? tc("saving") : tc("save")}
        </Button>
      </div>
    </form>
  );
}
