// Curated avatar gallery (cute -> cyberpunk) for the profile picker.
//
// Images live in `avatarData.ts` as base64 data URIs (generated from the
// 256px webp files). They are baked into the JS bundle, so avatars render
// with zero extra file requests.

import { AVATAR_DATA_URIS } from "./avatarData";
import { translate } from "@/lib/i18n";

export interface AvatarOption {
  id: string;
  label: string;
  src: string;
  emoji: string; // legacy fallback, also used while the image loads
}

const META: Array<{ id: string; label: string; emoji: string }> = [
  { id: "avatar-cat-cute", label: "Mochi Cat", emoji: "🐱" },
  { id: "avatar-lucky-cat", label: "Lucky Cat", emoji: "🐱" },
  { id: "avatar-fox", label: "Fox", emoji: "🦊" },
  { id: "avatar-panda", label: "Panda", emoji: "🐼" },
  { id: "avatar-shiba", label: "Shiba", emoji: "🐶" },
  { id: "avatar-robot", label: "Bolt", emoji: "🤖" },
  { id: "avatar-astro-cat", label: "Astro Cat", emoji: "🐱" },
  { id: "avatar-dragon", label: "Dragon", emoji: "🐲" },
  { id: "avatar-samurai", label: "Neon Samurai", emoji: "🥷" },
  { id: "avatar-neon-ghost", label: "Neon Ghost", emoji: "👻" },
];

export const AVATAR_OPTIONS: AvatarOption[] = META.map((m) => ({
  ...m,
  src: AVATAR_DATA_URIS[m.id] ?? "",
})).filter((a) => a.src.length > 0);

export const AVATARS: AvatarOption[] = AVATAR_OPTIONS;

export const DEFAULT_AVATAR_ID = "avatar-lucky-cat";

/** Display label of an avatar in the current UI language ("avatar.<slug>"). */
export function avatarLabel(id: string): string {
  const slug = id.replace(/^avatar-/, "");
  const key = `avatar.${slug}`;
  const translated = translate(key);
  if (translated !== key) return translated;
  return AVATAR_OPTIONS.find((a) => a.id === id)?.label ?? id;
}

/** Returns the avatar image (data URI) for an id, or undefined. */
export function avatarSrc(id: string | undefined): string | undefined {
  return getAvatarImage(id);
}

export function getAvatarImage(id: string | undefined): string | undefined {
  if (!id) return undefined;
  return AVATAR_OPTIONS.find((a) => a.id === id)?.src;
}

export function getAvatarEmoji(id: string | undefined): string {
  if (!id) return "🐱";
  return AVATAR_OPTIONS.find((a) => a.id === id)?.emoji ?? "🐱";
}
