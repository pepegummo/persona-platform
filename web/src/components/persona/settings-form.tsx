"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { NativeSelect } from "@/components/native-select";
import { KeyValueEditor } from "@/components/persona/key-value-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Persona, PersonaSettings, PersonaUpdate } from "@/lib/api/client";

const FORMATTING = ["bullets", "comparisons", "analogies", "headings", "code_blocks", "emoji"] as const;
const LANGUAGES = ["th", "en", "mixed"] as const;
const LENGTHS = ["short", "medium", "long"] as const;
const LEVELS = ["beginner", "intermediate", "expert"] as const;
const PROFILE_SUGGESTIONS = ["age", "zodiac", "color", "game", "book", "music"] as const;

type Props = {
  persona: Persona;
  busy: boolean;
  onSave: (patch: PersonaUpdate) => Promise<void>;
};

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

  function patch<K extends keyof PersonaSettings>(key: K, value: PersonaSettings[K]) {
    setSettings((s) => ({ ...s, [key]: value }));
  }

  function toggleFormatting(item: string, on: boolean) {
    const current = settings.formatting ?? [];
    patch("formatting", on ? [...current, item] : current.filter((f) => f !== item));
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
    await onSave(body);
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <section className="grid gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="display_name">{tp("displayName")}</Label>
          <Input
            id="display_name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
            maxLength={80}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="slug">{tp("slug")}</Label>
          <Input
            id="slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            pattern="[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?"
            required
          />
          <p className="text-xs text-muted-foreground">{tp("slugHint")}</p>
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
      </section>

      <section className="flex flex-col gap-2">
        <Label htmlFor="profile-add" className="text-lg font-medium">
          {tp("profile.title")}
        </Label>
        <p className="text-xs text-muted-foreground">{tp("profile.hint")}</p>
        <KeyValueEditor
          id="profile-add"
          value={settings.profile ?? {}}
          onChange={(next) => patch("profile", next)}
          keyPlaceholder={tp("profile.keyPlaceholder")}
          valuePlaceholder={tp("profile.valuePlaceholder")}
          suggestions={PROFILE_SUGGESTIONS.map((k) => tp(`profile.suggestions.${k}`))}
          disabled={busy}
        />
      </section>

      <section className="flex flex-col gap-2">
        <Label htmlFor="vocabulary-add" className="text-lg font-medium">
          {tp("vocabulary.title")}
        </Label>
        <p className="text-xs text-muted-foreground">{tp("vocabulary.hint")}</p>
        <KeyValueEditor
          id="vocabulary-add"
          value={settings.vocabulary ?? {}}
          onChange={(next) => patch("vocabulary", next)}
          keyPlaceholder={tp("vocabulary.keyPlaceholder")}
          valuePlaceholder={tp("vocabulary.valuePlaceholder")}
          disabled={busy}
        />
      </section>

      <h2 className="text-lg font-medium">{t("title")}</h2>
      <section className="grid gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="language">{t("language")}</Label>
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
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="answer_length">{t("answerLength")}</Label>
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
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="technical_level">{t("technicalLevel")}</Label>
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
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="tone">{t("tone")}</Label>
          <Input
            id="tone"
            value={settings.tone}
            onChange={(e) => patch("tone", e.target.value)}
            placeholder={t("toneHint")}
            maxLength={200}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="personality">{t("personality")}</Label>
          <Input
            id="personality"
            value={settings.personality}
            onChange={(e) => patch("personality", e.target.value)}
            maxLength={500}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="writing_style">{t("writingStyle")}</Label>
          <Input
            id="writing_style"
            value={settings.writing_style}
            onChange={(e) => patch("writing_style", e.target.value)}
            placeholder={t("writingStyleHint")}
            maxLength={500}
          />
        </div>
        <fieldset className="flex flex-col gap-2 sm:col-span-2">
          <legend className="text-sm font-medium">{t("formatting")}</legend>
          <div className="flex flex-wrap gap-4">
            {FORMATTING.map((f) => (
              <label key={f} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={(settings.formatting ?? []).includes(f)}
                  onChange={(e) => toggleFormatting(f, e.target.checked)}
                />
                {t(`formattingOptions.${f}`)}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label htmlFor="rules">{t("rules")}</Label>
          <Textarea
            id="rules"
            value={rules}
            onChange={(e) => setRules(e.target.value)}
            placeholder={t("rulesHint")}
            rows={3}
            maxLength={4000}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="mode">{t("mode")}</Label>
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
        </div>
      </section>

      <div>
        <Button type="submit" disabled={busy}>
          {busy ? tc("saving") : tc("save")}
        </Button>
      </div>
    </form>
  );
}
