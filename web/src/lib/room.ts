// A persona's look is derived from its slug, so the avatar and the public page always agree
// without storing anything. Order matters: index i here is avatar PALETTE[i] in persona-avatar.

export const ROOMS = ["marigold", "sky", "rose", "sage", "coral", "lilac"] as const;
export type Room = (typeof ROOMS)[number];

export function seedIndex(seed: string, size: number): number {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  return h % size;
}

export function roomFor(seed: string): Room {
  return ROOMS[seedIndex(seed, ROOMS.length)];
}
