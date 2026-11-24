// Interactive 2D lucky cat companion modal — Tamagotchi-style.
//
// Floating modal over the Dashboard: stat bars (satiety/mood/cleanliness/
// energy), a cozy cat-room scene with pose changes, AI chat integrated
// directly (Lucky Cat conversation), action buttons with sound effects,
// inventory, happiness meter, and daily check-in.
//
// AI replies appear in the speech bubble (trimmed to 2-3 sentences) and in
// the full conversation history below.

import { useEffect, useMemo, useRef, useState } from "react";
import { useCat } from "@/services/cat/useCat";
import { CAT_BACKGROUND, CAT_POSES } from "@/services/cat/catImages";
import type { CatPose } from "@/services/cat/catImages";
import { THEME_CAT_ART } from "@/services/theme/art/themeArt";
import { useTheme } from "@/services/theme/useTheme";
import { CAT_ITEMS, getItem, itemName } from "@/services/cat/items";
import { useLanguage, translate } from "@/lib/i18n";
import type { CatItem, ItemKind } from "@/services/cat/types";
import { RewardCelebration } from "./RewardCelebration";
import { playHappy, playSnore, playYawn, playPop } from "@/services/cat/sounds";
import { awardBadge, celebrateRewards } from "@/features/gamification/awardBadges";
import { useExpenses } from "@/services/expenses/useExpenses";
import { useBudgets } from "@/services/budgets/useBudgets";
import { useConversation } from "@/features/ai/useConversation";
import type { ConversationMessage } from "@/features/ai/conversationTypes";
import { useDictation } from "@/features/dictation/dictation";
import { DictationButton } from "@/features/dictation/DictationButton";
import "./catCompanion.css";

interface CatCompanionModalProps {
  open: boolean;
  onClose: () => void;
  expenseStats: { streakDays: number; longestStreak: number; totalExpenses: number };
}

type PickerKind = ItemKind | null;

/** Localized action label for a cat action button. */
function actionLabel(kind: "feed" | "poop" | "play" | "groom" | "sleep" | "wake"): string {
  return translate(kind === "poop" ? "cat.scoop" : `cat.${kind}`);
}

function StatBar({ icon, label, value, color }: { icon: string; label: string; value: number; color: string }) {
  return (
    <div className="cat-stat" title={`${label} ${Math.round(value)}`}>
      <span className="cat-stat-label">
        {icon}
        {label}
      </span>
      <div className="cat-stat-track">
        <div className="cat-stat-fill" style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }} />
      </div>
      <span className="cat-stat-num">{Math.round(value)}</span>
    </div>
  );
}

export function CatCompanionModal({ open, onClose, expenseStats }: CatCompanionModalProps) {
  const { locale, t } = useLanguage();
  const { state, loaded, checkIn, canCheckIn, feed, play, groom, cleanLitter, toggleSleep, maybeHappyDrop } = useCat();
  const { theme } = useTheme();
  const themeArt = THEME_CAT_ART[theme] ?? null;

  // AI chat (Lucky Cat conversation, merged into the modal).
  const { expenses } = useExpenses();
  const { budgets } = useBudgets();
  const {
    status: chatStatus,
    messages,
    sending,
    sendError,
    suggestions,
    sendMessage,
    clearMessages,
    dismissError,
  } = useConversation(expenses, budgets, null);

  const [pose, setPose] = useState<CatPose>("idle");
  const sceneBg = themeArt ? themeArt.poses[pose] : CAT_BACKGROUND;
  const [bubble, setBubble] = useState(t("cat.lede"));
  const [picker, setPicker] = useState<PickerKind>(null);
  const [dropNotice, setDropNotice] = useState<CatItem | null>(null);
  const [rewardShow, setRewardShow] = useState<{ title: string; items: CatItem[] } | null>(null);
  const [chatInput, setChatInput] = useState("");
  // Live dictation streams into the chat input while the mic is on.
  const dictation = useDictation(chatInput, setChatInput);
  const poseTimer = useRef<number | null>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // Reset when opened.
  useEffect(() => {
    if (open) {
      setPose(state.asleep ? "sleep" : "idle");
      setPicker(null);
      setDropNotice(null);
      setBubble(state.asleep ? t("cat.asleep") : t("cat.lede"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Re-translate the default bubble when the language changes.
  // Interaction bubbles (fed, checked in, …) are set at the moment of
  // the interaction, so they are already current; only the default
  // lede / asleep text can go stale.
  useEffect(() => {
    if (open) setBubble(state.asleep ? t("cat.asleep") : t("cat.lede"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale]);

  // Revert to idle/sleep pose after a few seconds.
  const revertPose = (ms = 3500) => {
    if (poseTimer.current) window.clearTimeout(poseTimer.current);
    poseTimer.current = window.setTimeout(() => {
      setPose(state.asleep ? "sleep" : "idle");
    }, ms);
  };
  useEffect(() => () => {
    if (poseTimer.current) window.clearTimeout(poseTimer.current);
  }, []);

  // Auto-scroll chat history to bottom.
  useEffect(() => {
    const el = chatScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const checkDrop = () => {
    const drop = maybeHappyDrop(expenseStats);
    if (drop) {
      setDropNotice(drop);
      setBubble(t("cat.drop", { emoji: drop.emoji, name: itemName(drop.id) }));
      playPop();
      window.setTimeout(() => setDropNotice(null), 4000);
    }
  };

  const ownedByKind = useMemo(() => {
    const kinds: Record<ItemKind, CatItem[]> = { food: [], toy: [], care: [] };
    for (const [id, count] of Object.entries(state.inventory)) {
      if (count <= 0) continue;
      const item = getItem(id);
      if (item) kinds[item.kind].push({ ...item, count } as CatItem & { count: number });
    }
    return kinds;
  }, [state.inventory]);

  const doCheckIn = () => {
    const res = checkIn();
    if (res.ok) {
      setBubble(t("cat.checkin", { streak: res.streak, count: res.items.length }));
      playPop();
      setPose("play");
      revertPose();
      // Celebrate check-in badges immediately, using the fresh streak
      // (the persisted cat state saves async, so read it from res).
      // Badge popups come first, then the gift rewards, each auto-closing.
      const celebrate = async () => {
        if (res.streak === 1) await awardBadge("checkin-1");
        if (res.streak >= 7) await awardBadge("checkin-7");
        if (res.items.length > 0) {
          celebrateRewards([{ title: t("cat.checkinGifts"), items: res.items }]);
        }
      };
      void celebrate();
    }
  };

  const doUseItem = (kind: ItemKind, itemId: string) => {
    const fn = kind === "food" ? feed : kind === "toy" ? play : groom;
    const item = fn(itemId);
    if (!item) {
      setBubble(t("cat.nothingToUse"));
      return;
    }
    setPicker(null);
    const label = kind === "food" ? t("cat.yum") : kind === "toy" ? t("cat.whee") : t("cat.fresh");
    setBubble(t("cat.usedItem", { label, emoji: item.emoji, name: itemName(item.id) }));
    setPose(kind === "food" ? "eat" : kind === "toy" ? "play" : "groom");
    playHappy();
    revertPose();
    checkDrop();
  };

  const doCleanLitter = () => {
    const found = cleanLitter();
    setBubble(found.length > 0 ? t("cat.litterFound", { emoji: found[0].emoji, name: itemName(found[0].id) }) : t("cat.litterClean"));
    setPose("play");
    playHappy();
    revertPose();
    checkDrop();
  };

  const doToggleSleep = () => {
    const goingToSleep = !state.asleep;
    toggleSleep();
    if (goingToSleep) {
      setPose("sleep");
      setBubble(t("cat.asleep"));
      playSnore();
    } else {
      setPose("idle");
      setBubble(t("cat.wokeUp"));
      playYawn();
      revertPose();
    }
  };

  const handleSendChat = async () => {
    const text = chatInput.trim();
    if (!text || sending) return;
    setChatInput("");
    try {
      await sendMessage(text);
    } catch {
      /* error shown via sendError */
    }
  };

  const handleSuggestion = (q: string) => {
    // Send directly — don't leave the question text in the input box.
    void (async () => {
      try {
        await sendMessage(q);
      } catch {
        /* error shown via sendError */
      }
    })();
  };

  if (!open) return null;

  const pickerItems = picker ? ownedByKind[picker] : [];
  const chatReady = chatStatus === "ready";

  return (
    <div className="cat-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label={t("cat.companion")}>
      <div className="cat-modal cat-modal--tama" onClick={(e) => e.stopPropagation()}>
        <div className="cat-modal-header">
          <span className="cat-modal-title">🐱 Lucky Cat</span>
          <div className="cat-happiness" title={t("cat.joy", { value: state.happiness })}>
            <span className="cat-happiness-label">{t("cat.joyLabel")}</span>
            <div className="cat-happiness-bar">
              <div className="cat-happiness-fill" style={{ width: `${state.happiness}%` }} />
            </div>
            <span className="cat-happiness-num">{state.happiness}</span>
          </div>
          {canCheckIn ? (
            <button className="cat-checkin-btn" onClick={doCheckIn}>
              {t("cat.checkinBtn")}
            </button>
          ) : (
            <span className="cat-checkin-done" title={t("cat.streak", { value: state.checkinStreak })}>
              {t("cat.checkinDay", { count: state.checkinStreak })}
            </span>
          )}
          <button className="cat-modal-close" onClick={onClose} aria-label={t("common.close")}>✕</button>
        </div>

        {/* Tamagotchi stat bars */}
        <div className="cat-stats">
          <StatBar icon="🍖" label={t("cat.satiety")} value={state.satiety} color="#f5a623" />
          <StatBar icon="😊" label={t("cat.mood")} value={state.happiness} color="#f76b8a" />
          <StatBar icon="🧼" label={t("cat.clean")} value={state.cleanliness} color="#4fc3f7" />
          <StatBar icon="⚡" label={t("cat.energy")} value={state.energy} color="#66bb6a" />
        </div>

        <div className="cat-scene" style={sceneBg ? { backgroundImage: `url(${sceneBg})` } : undefined}>
              {bubble && <div className="cat-bubble">{bubble}</div>}
              {!themeArt && (
                CAT_POSES[pose] ? (
                  <img className="cat-figure" src={CAT_POSES[pose]} alt="Lucky cat" />
                ) : (
                  <div className="cat-figure cat-figure--emoji">🐱</div>
                )
              )}
              {state.asleep && <div className="cat-sleep-z">💤</div>}
            </div>

            {dropNotice && (
              <div className="cat-notice" role="status">
                {t("cat.luckyDrop", { emoji: dropNotice.emoji, name: itemName(dropNotice.id) })}
              </div>
            )}

            <div className="cat-actions">
              <button className="cat-action" onClick={() => setPicker("food")} disabled={state.asleep}>
                🍖<span>{actionLabel("feed")}</span>
              </button>
              <button className="cat-action" onClick={doCleanLitter} disabled={state.asleep}>
                💩<span>{actionLabel("poop")}</span>
              </button>
              <button className="cat-action" onClick={() => setPicker("toy")} disabled={state.asleep}>
                🐾<span>{actionLabel("play")}</span>
              </button>
              <button className="cat-action" onClick={() => setPicker("care")} disabled={state.asleep}>
                💆<span>{actionLabel("groom")}</span>
              </button>
              <button className="cat-action" onClick={doToggleSleep}>
                {state.asleep ? "☀️" : "🌙"}<span>{state.asleep ? actionLabel("wake") : actionLabel("sleep")}</span>
              </button>
            </div>

        {/* Item picker (overlay) */}
        {picker && (
          <div className="cat-picker" role="dialog" aria-label={picker === "food" ? t("cat.chooseFood") : picker === "toy" ? t("cat.chooseToy") : t("cat.chooseCare")}>
            <div className="cat-picker-header">
              <span>{picker === "food" ? t("cat.chooseFood") : picker === "toy" ? t("cat.chooseToy") : t("cat.chooseCare")}</span>
              <button className="cat-modal-close" onClick={() => setPicker(null)} aria-label={t("cat.closePicker")}>✕</button>
            </div>
            {pickerItems.length === 0 ? (
              <p className="muted">{picker === "food" ? t("cat.noFoodItems") : picker === "toy" ? t("cat.noToyItems") : t("cat.noCareItems")}</p>
            ) : (
              <div className="cat-picker-grid">
                {pickerItems.map((item) => (
                  <button
                    key={item.id}
                    className="cat-picker-item"
                    onClick={() => doUseItem(picker, item.id)}
                  >
                    <span className="cat-picker-emoji">{item.emoji}</span>
                    <span className="cat-picker-name">{itemName(item.id)}</span>
                    <span className="cat-picker-count">×{(item as CatItem & { count: number }).count}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

            {/* AI chat */}
            <div className="cat-chat">
              <div className="cat-chat-header">
                <span className="cat-chat-title">{t("cat.talkTitle")}</span>
                {messages.length > 0 && (
                  <button
                    type="button"
                    className="cat-link-btn cat-link-btn--danger"
                    onClick={() => void clearMessages()}
                  >
                    {t("cat.clearHistory")}
                  </button>
                )}
              </div>

              <div className="cat-chat-history cat-chat-history--desktop" ref={chatScrollRef}>
                {messages.length === 0 && (
                  <div className="cat-chat-empty">
                    <p className="cat-chat-empty-title">{t("cat.hey")}</p>
                    <p className="muted">{t("cat.askAbout")}</p>
                  </div>
                )}
                {messages.map((m: ConversationMessage) => (
                  <div key={m.id} className={`cat-msg cat-msg--${m.role}`}>
                    <span className="cat-msg-role">{m.role === "user" ? t("cat.you") : "🐱"}</span>
                    <span className="cat-msg-text">{m.text}</span>
                  </div>
                ))}
                {sending && <div className="cat-msg cat-msg--assistant"><span className="cat-msg-role">🐱</span><span className="cat-typing">…</span></div>}
              </div>

              {sendError && (
                <div className="cat-chat-error" role="alert">
                  {sendError}
                  <button type="button" className="cat-link-btn" onClick={dismissError}>{t("common.dismiss")}</button>
                </div>
              )}

              {chatReady && suggestions.length > 0 && (
                <div className="cat-suggestions">
                  {suggestions.slice(0, 3).map((s) => (
                    <button
                      key={s}
                      type="button"
                      className="cat-suggestion-chip"
                      disabled={sending || state.asleep}
                      onClick={() => handleSuggestion(s)}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}

              <div className="cat-chat-input-row">
                <span className="dictation-wrap">
                  <input
                    type="text"
                    className={dictation.supported ? "cat-chat-input has-dictation" : "cat-chat-input"}
                    placeholder={t("cat.askPlaceholder")}
                    value={chatInput}
                    disabled={!chatReady || sending || state.asleep}
                    readOnly={dictation.listening}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void handleSendChat();
                    }}
                  />
                  <DictationButton
                    {...dictation}
                    disabled={!chatReady || sending || state.asleep}
                  />
                </span>
                <button
                  type="button"
                  className="cat-chat-send"
                  disabled={!chatReady || sending || !chatInput.trim() || state.asleep}
                  onClick={() => void handleSendChat()}
                  aria-label={t("common.send")}
                >
                  ➤
                </button>
              </div>
              {chatStatus !== "ready" && (
                <p className="muted">
                  {chatStatus === "loading" ? t("cat.aiReady") : t("cat.aiUnavailable")}
                </p>
              )}
            </div>

        {!loaded && <p className="muted">{t("common.loading")}</p>}
      </div>
      {rewardShow && (
        <RewardCelebration
          title={rewardShow.title}
          items={rewardShow.items}
          onDone={() => setRewardShow(null)}
        />
      )}
    </div>
  );
}

/** All catalog items (for tests / debugging). */
export function allCatItems(): CatItem[] {
  return CAT_ITEMS;
}
