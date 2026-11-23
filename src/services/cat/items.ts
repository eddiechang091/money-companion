// Interactive lucky cat — item catalog (18 items).
//
// Foods are consumed by feeding, toys by playing, care items by grooming.
// Rarity gates the reward tables: longer history -> rarer drops.

import type { CatItem } from "./types";
import { translate } from "@/lib/i18n";

export const CAT_ITEMS: CatItem[] = [
  // ---- Foods (7) ----
  { id: "food-kibble", name: "Kibble", emoji: "🍪", kind: "food", rarity: "common", happiness: 5, blurb: "Crunchy everyday staple" },
  { id: "food-chicken", name: "Chicken Strips", emoji: "🍗", kind: "food", rarity: "common", happiness: 6, blurb: "Lean and protein-packed" },
  { id: "food-tuna", name: "Tuna Can", emoji: "🐟", kind: "food", rarity: "rare", happiness: 8, blurb: "An irresistible aroma" },
  { id: "food-salmon", name: "Salmon Fillet", emoji: "🍣", kind: "food", rarity: "rare", happiness: 9, blurb: "Glistening ocean delicacy" },
  { id: "food-strip", name: "Cat Puree", emoji: "🧃", kind: "food", rarity: "common", happiness: 5, blurb: "Squeeze and watch it vanish" },
  { id: "food-pudding", name: "Cat Pudding", emoji: "🍮", kind: "food", rarity: "rare", happiness: 8, blurb: "Wobbly, silky dessert" },
  { id: "food-dried-fish", name: "Freeze-Dried Fish", emoji: "🐠", kind: "food", rarity: "epic", happiness: 12, blurb: "The legendary top-tier treat" },

  // ---- Care (4) ----
  { id: "care-mint", name: "Catnip", emoji: "🌿", kind: "care", rarity: "common", happiness: 6, blurb: "One sniff, instant zoomies" },
  { id: "care-silvervine", name: "Silvervine", emoji: "🍃", kind: "care", rarity: "rare", happiness: 9, blurb: "Even stronger than catnip" },
  { id: "care-paste", name: "Hairball Paste", emoji: "🧴", kind: "care", rarity: "common", happiness: 4, blurb: "Goodbye, hairballs" },
  { id: "care-brush", name: "Massage Brush", emoji: "💆", kind: "care", rarity: "rare", happiness: 8, blurb: "Grooming and massage in one" },

  // ---- Toys (7) ----
  { id: "toy-wand", name: "Feather Wand", emoji: "🎣", kind: "toy", rarity: "common", happiness: 7, blurb: "Fluttering feathers to chase" },
  { id: "toy-yarn", name: "Yarn Ball", emoji: "🧶", kind: "toy", rarity: "common", happiness: 5, blurb: "Rolls around delightfully" },
  { id: "toy-bell", name: "Jingle Ball", emoji: "🔔", kind: "toy", rarity: "common", happiness: 6, blurb: "Rings with every bat" },
  { id: "toy-laser", name: "Laser Pointer", emoji: "🔦", kind: "toy", rarity: "rare", happiness: 9, blurb: "The dot that can't be caught" },
  { id: "toy-box", name: "Cardboard Box", emoji: "📦", kind: "toy", rarity: "common", happiness: 5, blurb: "A cat's ultimate mansion" },
  { id: "toy-scratcher", name: "Scratch Pad", emoji: "🛋️", kind: "toy", rarity: "rare", happiness: 7, blurb: "A scratching paradise" },
  { id: "toy-mouse", name: "Toy Mouse", emoji: "🐭", kind: "toy", rarity: "epic", happiness: 11, blurb: "A wiggly hunt, the best thrill" },
];

const BY_ID = new Map(CAT_ITEMS.map((i) => [i.id, i]));

/** Display name of a cat item in the current UI language ("item.<id>"). */
export function itemName(id: string): string {
  const key = `item.${id}`;
  const translated = translate(key);
  return translated !== key ? translated : (BY_ID.get(id)?.name ?? id);
}

/** Display blurb of a cat item in the current UI language ("item.<id>.desc"). */
export function itemBlurb(id: string): string {
  const key = `item.${id}.desc`;
  const translated = translate(key);
  return translated !== key ? translated : (BY_ID.get(id)?.blurb ?? "");
}

export function getItem(id: string): CatItem | undefined {
  return BY_ID.get(id);
}

/** Weighted random pick honoring rarity. Longer history unlocks rarer pools. */
export function randomItem(rarityBoost = 0): CatItem {
  // rarityBoost 0 -> common-heavy; 1 -> rare-friendly; 2 -> epic possible
  const roll = Math.random();
  let rarity: CatItem["rarity"] = "common";
  if (rarityBoost >= 2 && roll > 0.82) rarity = "epic";
  else if (rarityBoost >= 1 && roll > 0.55) rarity = "rare";
  else if (roll > 0.85) rarity = "rare";
  const pool = CAT_ITEMS.filter((i) => i.rarity === rarity);
  return pool[Math.floor(Math.random() * pool.length)];
}

/** Pick n items (may repeat) for a reward bundle. */
export function randomItems(n: number, rarityBoost = 0): CatItem[] {
  return Array.from({ length: n }, () => randomItem(rarityBoost));
}
