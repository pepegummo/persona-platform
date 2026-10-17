import { seedIndex } from "@/lib/room";
import { cn } from "@/lib/utils";

// Warm pastel fills with dark text; each pair passes AA and reads on light and dark grounds.
// Same order as ROOMS in lib/room.ts, so a persona's avatar matches its public page.
const PALETTE: ReadonlyArray<readonly [string, string]> = [
  ["#e9b44c", "#3b2a08"],
  ["#8fb3d9", "#13314f"],
  ["#d9a0b5", "#4a1a2c"],
  ["#9cc5a1", "#173b20"],
  ["#e89a7a", "#4a1c0c"],
  ["#b9a6e0", "#2a1a52"],
];

// Thai leading vowels (เ แ โ ใ ไ) are written before the consonant they follow in speech,
// so "เบล" should show "บ", not "เ".
const THAI_LEADING_VOWEL = /[เ-ไ]/;

export function initialOf(name: string): string {
  for (const ch of Array.from(name.trim())) {
    if (THAI_LEADING_VOWEL.test(ch) || /\s/.test(ch)) continue;
    return ch.toLocaleUpperCase();
  }
  return "?";
}

function colorFor(seed: string): readonly [string, string] {
  return PALETTE[seedIndex(seed, PALETTE.length)];
}

const SIZES = {
  xs: "size-7 text-xs",
  sm: "size-10 text-sm",
  md: "size-12 text-lg",
  lg: "size-16 text-2xl",
} as const;

/** Initials avatar. No uploads yet, so the colour is derived from a stable seed (the slug). */
export function PersonaAvatar({
  name,
  seed,
  size = "md",
  className,
}: {
  name: string;
  seed?: string;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const [bg, fg] = colorFor(seed ?? name);
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-bold select-none",
        SIZES[size],
        className,
      )}
      style={{ backgroundColor: bg, color: fg }}
    >
      {initialOf(name)}
    </span>
  );
}
