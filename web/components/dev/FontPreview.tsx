"use client";

import { Type, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { CURRENT, FONT_STORAGE_KEY, HEADING_FONTS, PAIRINGS, UI_FONTS } from "@/lib/font-options";
import { cn } from "@/lib/utils";

type Choice = { h: string; ui: string };

function apply(c: Choice) {
  const d = document.documentElement;
  d.dataset.fontH = c.h;
  d.dataset.fontUi = c.ui;
  try {
    localStorage.setItem(FONT_STORAGE_KEY, JSON.stringify(c));
  } catch {}
}

/**
 * TEMPORARY, local dev only: switches the heading and UI fonts across the whole site so the owner can pick a pair.
 * The panel itself stays in the system font so it does not jump while switching.
 */
export function FontPreview() {
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<Choice>({ h: CURRENT.heading, ui: CURRENT.ui });

  useEffect(() => {
    const d = document.documentElement.dataset;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read the pre-paint choice once
    setChoice({ h: d.fontH ?? CURRENT.heading, ui: d.fontUi ?? CURRENT.ui });
  }, []);

  const set = (c: Choice) => {
    setChoice(c);
    apply(c);
  };
  const pairing = PAIRINGS.find((p) => p.heading === choice.h && p.ui === choice.ui);
  const h = HEADING_FONTS.find((f) => f.id === choice.h);
  const ui = UI_FONTS.find((f) => f.id === choice.ui);

  return (
    <div className="fixed right-4 bottom-24 z-[100] text-13 text-text md:bottom-4" style={{ fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>
      {open ? (
        <div className="max-h-[80dvh] w-[320px] overflow-y-auto rounded-2xl border border-border bg-surface p-4 shadow-pop">
          <div className="flex items-center justify-between">
            <p className="font-semibold">Шрифты · только локально</p>
            <button type="button" aria-label="Закрыть" className="rounded-full p-1 text-muted hover:text-text" onClick={() => setOpen(false)}>
              <X size={16} />
            </button>
          </div>

          <p className="mt-3 text-xs text-muted">Готовые пары</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <Chip active={choice.h === CURRENT.heading && choice.ui === CURRENT.ui} onClick={() => set({ h: CURRENT.heading, ui: CURRENT.ui })}>
              Сейчас
            </Chip>
            {PAIRINGS.map((p, i) => (
              <Chip key={p.id} active={pairing?.id === p.id} onClick={() => set({ h: p.heading, ui: p.ui })}>
                {i + 1}. {p.name}
              </Chip>
            ))}
          </div>

          <p className="mt-4 text-xs text-muted">Заголовки</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {HEADING_FONTS.map((f) => (
              <Chip key={f.id} active={choice.h === f.id} onClick={() => set({ ...choice, h: f.id })}>
                {f.name}
              </Chip>
            ))}
          </div>
          {h && <p className="mt-1.5 text-xs text-muted">{h.note}</p>}

          <p className="mt-4 text-xs text-muted">Текст и кнопки</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {UI_FONTS.map((f) => (
              <Chip key={f.id} active={choice.ui === f.id} onClick={() => set({ ...choice, ui: f.id })}>
                {f.name}
              </Chip>
            ))}
          </div>
          {ui && <p className="mt-1.5 text-xs text-muted">{ui.note}</p>}

          <Link href="/fonts" className="mt-4 inline-block text-accent-text underline underline-offset-2">
            Все пары рядом →
          </Link>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex h-10 items-center gap-2 rounded-full border border-border bg-surface px-4 font-medium shadow-pop hover:bg-surface-2"
        >
          <Type size={16} aria-hidden />
          Шрифты
        </button>
      )}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "rounded-full border px-2.5 py-1 text-xs transition-colors",
        active ? "border-accent bg-accent-soft text-accent-text" : "border-border text-muted hover:text-text",
      )}
    >
      {children}
    </button>
  );
}
