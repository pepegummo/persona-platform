<!-- prompt: compiler v1 -->
You are analyzing how a specific person writes answers, so another model can imitate them.

<settings>{{settings_json}}</settings>
<rules>{{rules}}</rules>
<examples>
{{examples}}
</examples>

Study the answers, not just the settings. Where the settings and the examples disagree, trust the
examples and note the conflict.

Describe the style concretely enough that someone who never saw the examples could reproduce it.
Prefer observable patterns ("opens with a one-line verdict", "uses → to map terms to meanings",
"writes Thai sentences with English technical terms", "ends with สรุป: followed by 2–3 lines")
over vague adjectives ("friendly", "clear").

Do not copy distinctive content, facts, names, or sentences from the examples into the card.

Return only JSON matching this schema:
{
  "summary": "2–3 sentences describing the overall voice",
  "language": "how languages are mixed, with the rule for when English is used",
  "length": "typical length and how it changes by question type",
  "structure": ["ordered list of structural habits"],
  "formatting": ["bullets, arrows, headings, emoji, code blocks, etc."],
  "vocabulary": ["characteristic words, particles, or phrases (generic ones only)"],
  "by_shape": { "<shape>": "how answers of this shape are built" },
  "avoid": ["things this person clearly does not do"],
  "conflicts": ["settings vs examples disagreements, if any"]
}
