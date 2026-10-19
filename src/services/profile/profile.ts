import { getKvStore } from "@/services/anna/storage";
import { STORAGE_KEYS } from "@/lib/constants";
import { connectAnna } from "@/services/anna/runtime";

// ---------------------------------------------------------------------------
// User profile — local for now, Anna-ready.
//
// The Anna host SDK does not currently expose a user-info API (the client
// only offers llm / storage / window / tools), so the profile is stored
// locally in Anna Storage. `fetchAnnaUser` defensively probes the host
// client so that when the platform adds a user API, we can prefer it
// without changing call sites.
// ---------------------------------------------------------------------------

export type ProfileStatus = "available" | "focus" | "busy" | "away";

export interface ProfileStatusDef {
  id: ProfileStatus;
  emoji: string;
  label: string;
}

export const PROFILE_STATUSES: ProfileStatusDef[] = [
  { id: "available", emoji: "😌", label: "Available" },
  { id: "focus", emoji: "🎯", label: "Focusing" },
  { id: "busy", emoji: "⏳", label: "Busy" },
  { id: "away", emoji: "🌙", label: "Away" },
];

export interface UserProfile {
  displayName: string;
  /** Curated gallery avatar id (see avatars.ts). */
  avatarId: string;
  /** Legacy emoji avatar — used when avatarId is unset. */
  avatarEmoji: string;
  status: ProfileStatus;
  /** Default currency code (ISO 4217). null = user hasn't chosen yet. */
  currency: string | null;
}

export const DEFAULT_PROFILE: UserProfile = {
  // Default display name. "Lucky Cat" is the AI companion's name, so it
  // must not be the user's. The Anna host SDK exposes no user-info API, so
  // there is no user id to default to. The user can rename in Profile settings.
  displayName: "Adam Smith",
  avatarId: "avatar-lucky-cat",
  avatarEmoji: "😊",
  status: "available",
  currency: null,
};

export interface AnnaUserInfo {
  displayName?: string;
  avatarUrl?: string;
}

/**
 * Probe the Anna host client for user info. Returns null when the host
 * does not offer a user API (the case today).
 */
export async function fetchAnnaUser(): Promise<AnnaUserInfo | null> {
  try {
    const runtime = await connectAnna();
    const client = runtime.client as unknown as {
      user?: { get?: () => Promise<unknown> };
    } | null;
    const get = client?.user?.get;
    if (typeof get !== "function") return null;
    const info = (await get()) as AnnaUserInfo | null;
    if (!info || typeof info !== "object") return null;
    return info;
  } catch {
    return null;
  }
}

export async function loadProfile(): Promise<UserProfile> {
  const store = await getKvStore();
  const saved = await store.get<UserProfile>(STORAGE_KEYS.profile);
  return { ...DEFAULT_PROFILE, ...(saved ?? {}) };
}

export async function saveProfile(profile: UserProfile): Promise<void> {
  const store = await getKvStore();
  await store.set(STORAGE_KEYS.profile, profile);
}

export function statusDef(id: ProfileStatus): ProfileStatusDef {
  return PROFILE_STATUSES.find((s) => s.id === id) ?? PROFILE_STATUSES[0];
}
