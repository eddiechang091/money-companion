// Interactive lucky cat — shared companion state (Anna Storage persisted).
//
// Happiness decays ~2 points per hour while away. Feeding / playing /
// grooming raise it. A very happy cat (>80) may drop a random item after
// an interaction (rate-limited to one drop per 10 minutes).

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import { getKvStore } from "@/services/anna/storage";
import type { CatItem, CatState, ExpenseStats, Inventory } from "./types";
import { DEFAULT_CAT_STATE } from "./types";
import { getItem, randomItem, randomItems } from "./items";
import { historyRarityBoost } from "./milestones";

const CAT_STATE_KEY = "cat:companion_state";

const HAPPINESS_DECAY_PER_HOUR = 2;
const DROP_HAPPINESS_THRESHOLD = 80;
const DROP_COOLDOWN_MS = 10 * 60 * 1000;

function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function yesterdayLocal(): string {
  const d = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function loadCatState(): Promise<CatState> {
  try {
    const store = await getKvStore();
    const saved = await store.get<CatState>(CAT_STATE_KEY);
    if (!saved) return { ...DEFAULT_CAT_STATE };
    const now = Date.now();
    const hoursAway = Math.max(0, (now - (saved.updatedAt || now)) / 3_600_000);
    const decay = Math.floor(hoursAway * HAPPINESS_DECAY_PER_HOUR);
    // New stats decay too; sleeping restores energy instead of draining it.
    const satietyDecay = Math.floor(hoursAway * 2);
    const cleanlinessDecay = Math.floor(hoursAway * 1);
    const energyDelta = saved.asleep
      ? Math.floor(hoursAway * 10) // sleeping restores
      : -Math.floor(hoursAway * 1);
    const clamp = (v: number) => Math.max(0, Math.min(100, v));
    return {
      ...DEFAULT_CAT_STATE,
      ...saved,
      happiness: clamp(saved.happiness - decay),
      satiety: clamp((saved.satiety ?? 60) - satietyDecay),
      cleanliness: clamp((saved.cleanliness ?? 60) - cleanlinessDecay),
      energy: clamp((saved.energy ?? 80) + energyDelta),
      inventory: saved.inventory ?? {},
      claimedMilestones: saved.claimedMilestones ?? [],
      updatedAt: now,
    };
  } catch {
    return { ...DEFAULT_CAT_STATE };
  }
}

async function saveCatState(state: CatState): Promise<void> {
  try {
    const store = await getKvStore();
    await store.set(CAT_STATE_KEY, { ...state, updatedAt: Date.now() });
  } catch {
    /* best effort */
  }
}

export interface CheckInResult {
  /** False when already checked in today. */
  ok: boolean;
  items: CatItem[];
  streak: number;
}

export interface CatContextValue {
  state: CatState;
  loaded: boolean;
  /** Daily check-in. Grants 1-3 items (+streak bonus). */
  checkIn: () => CheckInResult;
  canCheckIn: boolean;
  /** Feed a food item from inventory. Returns false when none owned. */
  feed: (itemId: string) => CatItem | null;
  /** Play with a toy from inventory. Returns false when none owned. */
  play: (itemId: string) => CatItem | null;
  /** Groom with a care item from inventory. */
  groom: (itemId: string) => CatItem | null;
  /** Clean the litter box. May randomly reward items. */
  cleanLitter: () => CatItem[];
  toggleSleep: () => void;
  /** Grant items (check-in, drops, milestones). */
  grantItems: (items: CatItem[]) => void;
  /** Maybe drop a random item when the cat is very happy. */
  maybeHappyDrop: (stats: ExpenseStats) => CatItem | null;
}

const CatContext = createContext<CatContextValue | null>(null);

function addToInventory(inv: Inventory, items: CatItem[]): Inventory {
  const next = { ...inv };
  for (const item of items) next[item.id] = (next[item.id] ?? 0) + 1;
  return next;
}

function takeFromInventory(inv: Inventory, itemId: string): Inventory | null {
  const count = inv[itemId] ?? 0;
  if (count <= 0) return null;
  const next = { ...inv };
  if (count === 1) delete next[itemId];
  else next[itemId] = count - 1;
  return next;
}

export function CatProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CatState>({ ...DEFAULT_CAT_STATE });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadCatState().then((s) => {
      if (!cancelled) {
        setState(s);
        setLoaded(true);
        // Persist the decay-adjusted state.
        saveCatState(s).catch(() => {});
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback((next: CatState) => {
    setState(next);
    saveCatState(next).catch(() => {});
  }, []);

  const canCheckIn = loaded && state.lastCheckinDate !== todayLocal();

  const checkIn = useCallback((): CheckInResult => {
    const today = todayLocal();
    if (state.lastCheckinDate === today) {
      return { ok: false, items: [], streak: state.checkinStreak };
    }
    const continued = state.lastCheckinDate === yesterdayLocal();
    const streak = continued ? state.checkinStreak + 1 : 1;
    // 1-3 items; a 7+ streak adds a bonus roll.
    const count = 1 + Math.floor(Math.random() * 3) + (streak >= 7 ? 1 : 0);
    const items = randomItems(count, streak >= 14 ? 1 : 0);
    persist({
      ...state,
      lastCheckinDate: today,
      checkinStreak: streak,
      inventory: addToInventory(state.inventory, items),
      happiness: Math.min(100, state.happiness + 3),
      satiety: Math.min(100, state.satiety + 5),
      cleanliness: Math.min(100, state.cleanliness + 5),
      energy: Math.min(100, state.energy + 5),
    });
    return { ok: true, items, streak };
  }, [persist, state]);

  const useItemFor = useCallback(
    (
      itemId: string,
      statDelta: { satiety?: number; cleanliness?: number; energy?: number }
    ): CatItem | null => {
      const item = getItem(itemId);
      if (!item) return null;
      const nextInv = takeFromInventory(state.inventory, itemId);
      if (!nextInv) return null;
      const clamp = (v: number) => Math.max(0, Math.min(100, v));
      persist({
        ...state,
        inventory: nextInv,
        happiness: clamp(state.happiness + item.happiness),
        satiety: clamp(state.satiety + (statDelta.satiety ?? 0)),
        cleanliness: clamp(state.cleanliness + (statDelta.cleanliness ?? 0)),
        energy: clamp(state.energy + (statDelta.energy ?? 0)),
      });
      return item;
    },
    [persist, state]
  );

  const feed = useCallback(
    (itemId: string) => useItemFor(itemId, { satiety: 14 }),
    [useItemFor]
  );
  const play = useCallback(
    (itemId: string) => useItemFor(itemId, { energy: -8, satiety: -3 }),
    [useItemFor]
  );
  const groom = useCallback(
    (itemId: string) => useItemFor(itemId, { cleanliness: 14 }),
    [useItemFor]
  );

  const cleanLitter = useCallback((): CatItem[] => {
    // A clean box makes the cat content; sometimes it finds a "treasure".
    const found = Math.random() < 0.45 ? [randomItem(0)] : [];
    persist({
      ...state,
      inventory: addToInventory(state.inventory, found),
      happiness: Math.min(100, state.happiness + 4),
      cleanliness: Math.min(100, state.cleanliness + 10),
    });
    return found;
  }, [persist, state]);

  const toggleSleep = useCallback(() => {
    const waking = state.asleep;
    persist({
      ...state,
      asleep: !state.asleep,
      // A good nap restores energy.
      energy: waking ? Math.min(100, state.energy + 25) : state.energy,
    });
  }, [persist, state]);

  const grantItems = useCallback(
    (items: CatItem[]) => {
      if (items.length === 0) return;
      persist({ ...state, inventory: addToInventory(state.inventory, items) });
    },
    [persist, state]
  );

  const maybeHappyDrop = useCallback(
    (stats: ExpenseStats): CatItem | null => {
      const now = Date.now();
      if (state.happiness < DROP_HAPPINESS_THRESHOLD) return null;
      if (state.lastDropAt && now - state.lastDropAt < DROP_COOLDOWN_MS) return null;
      if (Math.random() > 0.35) return null;
      const item = randomItem(historyRarityBoost(stats));
      persist({
        ...state,
        lastDropAt: now,
        inventory: addToInventory(state.inventory, [item]),
      });
      return item;
    },
    [persist, state]
  );

  const value = useMemo<CatContextValue>(
    () => ({
      state,
      loaded,
      checkIn,
      canCheckIn,
      feed,
      play,
      groom,
      cleanLitter,
      toggleSleep,
      grantItems,
      maybeHappyDrop,
    }),
    [
      state,
      loaded,
      checkIn,
      canCheckIn,
      feed,
      play,
      groom,
      cleanLitter,
      toggleSleep,
      grantItems,
      maybeHappyDrop,
    ]
  );

  return <CatContext.Provider value={value}>{children}</CatContext.Provider>;
}

/** Shared cat companion state — every consumer sees updates immediately. */
export function useCat(): CatContextValue {
  const ctx = useContext(CatContext);
  if (!ctx) throw new Error("useCat must be used inside <CatProvider>");
  return ctx;
}
