// Floating 2D lucky cat launcher (dashboard).
//
// Draggable companion button that opens the interactive cat modal.
// Shows a red dot when the daily check-in is available.

import { useLanguage } from "@/lib/i18n";
import { useEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";
import { useCat } from "@/services/cat/useCat";
import { CAT_POSES } from "@/services/cat/catImages";
import { THEME_CAT_ART } from "@/services/theme/art/themeArt";
import { useTheme } from "@/services/theme/useTheme";
import { getKvStore } from "@/services/anna/storage";

const CAT_LAUNCHER_POS_KEY = "ui:cat_launcher_position";

interface Pos {
  dx: number;
  dy: number;
}

const BUBBLE_MESSAGE_KEYS = ["cat.lookAtMe", "cat.tapMe"] as const;

export function CatLauncher({ onOpen }: { onOpen: () => void }) {
  const { t } = useLanguage();
  const { canCheckIn } = useCat();
  const [pos, setPos] = useState<Pos>({ dx: 0, dy: 0 });
  const [bubbleOn, setBubbleOn] = useState(true);
  const [bubbleIndex, setBubbleIndex] = useState(0);
  const posRef = useRef(pos);
  posRef.current = pos;
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    origDx: number;
    origDy: number;
    moved: boolean;
  } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const store = await getKvStore();
        const saved = await store.get<Pos>(CAT_LAUNCHER_POS_KEY);
        if (saved && typeof saved.dx === "number" && typeof saved.dy === "number") {
          setPos({ dx: saved.dx, dy: saved.dy });
        }
      } catch {
        /* keep default */
      }
    })();
  }, []);

  // Idle bubble: visible 5s out of every 20s (same rhythm as the old 3D cat).
  useEffect(() => {
    setBubbleOn(true);
    const t1 = window.setTimeout(() => setBubbleOn(false), 5000);
    const iv = window.setInterval(() => {
      setBubbleIndex((i) => i + 1);
      setBubbleOn(true);
      window.setTimeout(() => setBubbleOn(false), 5000);
    }, 20000);
    return () => {
      window.clearTimeout(t1);
      window.clearInterval(iv);
    };
  }, []);

  function onPointerDown(e: PointerEvent<HTMLButtonElement>) {
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origDx: pos.dx,
      origDy: pos.dy,
      moved: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const dx = drag.origDx + (e.clientX - drag.startX);
    const dy = drag.origDy + (e.clientY - drag.startY);
    if (Math.abs(e.clientX - drag.startX) + Math.abs(e.clientY - drag.startY) > 6) {
      drag.moved = true;
    }
    if (drag.moved) {
      const maxDx = window.innerWidth - 76 - 36;
      const maxDy = window.innerHeight - 76 - 36;
      setPos({
        dx: Math.min(0, Math.max(-maxDx, dx)),
        dy: Math.min(0, Math.max(-maxDy, dy)),
      });
    }
  }

  function onPointerUp(e: PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    try {
      e.currentTarget.releasePointerCapture(drag.pointerId);
    } catch {
      /* noop */
    }
    if (drag.moved) {
      const next = { ...posRef.current };
      getKvStore()
        .then((store) => store.set(CAT_LAUNCHER_POS_KEY, next))
        .catch(() => {});
    } else {
      onOpen();
    }
  }

  const { theme } = useTheme();
  const themeArt = THEME_CAT_ART[theme] ?? null;
  const img = themeArt ? themeArt.portrait : CAT_POSES.idle;

  return (
    <div className="cat-launcher-wrap" style={{ transform: `translate(${pos.dx}px, ${pos.dy}px)` }}>
      <button
        className="cat-launcher"
        aria-label={t("cat.openCompanion")}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        {img ? (
          <img src={img} alt="" draggable={false} />
        ) : (
          <span className="cat-launcher-emoji">🐱</span>
        )}
      </button>
      {bubbleOn && (
        <div className="cat-launcher-bubble" role="status">
          {canCheckIn ? t("cat.checkinTime") : t(BUBBLE_MESSAGE_KEYS[bubbleIndex % BUBBLE_MESSAGE_KEYS.length])}
        </div>
      )}
    </div>
  );
}
