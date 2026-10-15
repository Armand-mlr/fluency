"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db/schema";
import { deleteMistake, saveMistake } from "@/lib/db/repo";
import type { Card as MemCard, Mistake, MistakeCause, MistakeType } from "@/lib/types";
import { Button, Chip, Empty, Label, LinkButton, Modal, Page, PageHeader } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { STATE_LABEL } from "@/lib/engine/srs";
import { cx, relativeDays } from "@/lib/util";

const TYPES: MistakeType[] = ["grammar", "tense", "preposition", "word-order", "vocabulary", "false-friend", "collocation", "register", "spelling", "style"];
const CAUSES: MistakeCause[] = ["french-interference", "false-friend", "overgeneralisation", "register-mismatch", "unnatural-phrasing", "carelessness", "unknown"];

export default function MistakesPage() {
  const mistakes = useLiveQuery(() => db.mistakes.toArray(), []) ?? [];
  const cards = useLiveQuery(() => db.cards.where("refType").equals("mistake").toArray(), []) ?? [];
  const [type, setType] = useState<MistakeType | "">("");
  const [editing, setEditing] = useState<Partial<Mistake> | null>(null);
  const cardOf = (id: string) => cards.find((c) => c.refId === id);

  const list = mistakes
    .filter((m) => !type || m.type === type)
    .sort((a, b) => Number(!!a.resolved) - Number(!!b.resolved) || b.count - a.count || b.lastSeen - a.lastSeen);
  const byCause = new Map<string, number>();
  for (const m of mistakes) byCause.set(m.cause, (byCause.get(m.cause) ?? 0) + m.count);
  const topCauses = [...byCause.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);

  return (
    <Page>
      <PageHeader
        title={<>My recurring <em className="text-bad">mistakes</em></>}
        kicker={`${mistakes.length} logged · reviewed first in every session`}
        lede="Every trap you fall into lands here with its explanation, then comes back in your reviews, in different forms, until it stops happening."
      >
        <LinkButton href="/session?mode=mistakes">
          <Icon name="target" /> Drill my mistakes
        </LinkButton>
        <Button variant="primary" onClick={() => setEditing({ type: "grammar", cause: "french-interference" })}>
          <Icon name="plus" /> Log a mistake
        </Button>
      </PageHeader>

      {topCauses.length > 0 && (
        <div className="mb-10">
          <p className="kicker mb-3">Where they come from</p>
          <div className="flex h-3 rounded-full overflow-hidden gap-[3px]">
            {topCauses.map(([c, n], k) => (
              <div key={c} className={k === 0 ? "bg-bad" : k === 1 ? "bg-warn" : "bg-line-strong"} style={{ flex: n }} title={`${c}: ${n}`} />
            ))}
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-1 mt-3">
            {topCauses.map(([c, n], k) => (
              <span key={c} className="text-[13px] flex items-center gap-2">
                <span className={cx("size-2 rounded-full", k === 0 ? "bg-bad" : k === 1 ? "bg-warn" : "bg-line-strong")} />
                {c.replace(/-/g, " ")} <span className="mono text-faint text-[11px]">{n}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-1.5 flex-wrap mb-6">
        <FilterChip on={!type} onClick={() => setType("")}>All</FilterChip>
        {TYPES.filter((t) => mistakes.some((m) => m.type === t)).map((t) => (
          <FilterChip key={t} on={type === t} onClick={() => setType(t)}>{t}</FilterChip>
        ))}
      </div>

      {list.length === 0 ? (
        <Empty title="No mistakes yet">
          When you fall into a trap during practice, it lands here automatically with its explanation, and comes back in your reviews until it&apos;s fixed. You can also log
          mistakes you notice yourself (in emails, essays, conversations).
        </Empty>
      ) : (
        <div className="grid md:grid-cols-2 gap-3">
          {list.map((m) => (
            <MistakeCard key={m.id} m={m} card={cardOf(m.id)} onEdit={() => setEditing(m)} />
          ))}
        </div>
      )}
      <MistakeForm m={editing} onClose={() => setEditing(null)} />
    </Page>
  );
}

function FilterChip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={cx("text-[13px] rounded-full px-3.5 h-8 border transition-colors", on ? "border-accent bg-accent text-accent-ink font-semibold" : "border-line text-muted hover:text-ink hover:border-line-strong")}>
      {children}
    </button>
  );
}

function MistakeCard({ m, card, onEdit }: { m: Mistake; card?: MemCard; onEdit: () => void }) {
  return (
    <div className={cx("card card-hover p-6 grid grid-cols-[1fr_auto] gap-4", m.resolved && "opacity-55")}>
      <div className="min-w-0">
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <Chip>{m.type}</Chip>
          <span className="mono text-[10.5px] text-faint uppercase tracking-wider">{m.cause.replace(/-/g, " ")}</span>
        </div>
        <p className="font-display text-[20px] leading-snug text-bad/80 line-through decoration-bad/50 decoration-1">{m.wrong}</p>
        <p className="font-display text-[22px] leading-snug mt-2 flex items-start gap-2">
          <Icon name="check" className="size-4 text-good mt-2 shrink-0" />
          {m.correct}
        </p>
        {m.explanation && <p className="text-[13.5px] text-muted mt-4 leading-relaxed">{m.explanation}</p>}
        <p className="mono text-[10.5px] text-faint mt-4">
          {card ? `${STATE_LABEL[card.state].toUpperCase()} · ${card.state === "new" ? "first review soon" : `next ${relativeDays(card.due)}`}` : ""}
          {m.resolved && " · FIXED"}
        </p>
      </div>
      <div className="flex flex-col items-end justify-between">
        <span className={cx("font-display italic-display text-[44px] leading-none num", m.count >= 3 ? "text-bad" : m.count >= 2 ? "text-warn" : "text-line-strong")}>×{m.count}</span>
        <button onClick={onEdit} className="size-8 grid place-items-center rounded-full text-faint hover:text-ink hover:bg-surface-2" aria-label="Edit">
          <Icon name="edit" />
        </button>
      </div>
    </div>
  );
}

function MistakeForm({ m, onClose }: { m: Partial<Mistake> | null; onClose: () => void }) {
  const [f, setF] = useState<Partial<Mistake>>({});
  const [opened, setOpened] = useState<Partial<Mistake> | null>(null);
  if (m !== opened) {
    setOpened(m);
    if (m) setF(m);
  }
  if (!m) return null;
  const ok = f.wrong?.trim() && f.correct?.trim();
  return (
    <Modal open title={f.id ? "Edit mistake" : "Log a mistake"} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <Label>What I wrote / said</Label>
          <input className="field" value={f.wrong ?? ""} onChange={(e) => setF({ ...f, wrong: e.target.value })} placeholder="I am agree with you." autoFocus />
        </div>
        <div>
          <Label>Correct version</Label>
          <input className="field" value={f.correct ?? ""} onChange={(e) => setF({ ...f, correct: e.target.value })} placeholder="I agree with you." />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label>Type</Label>
            <select className="field" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as MistakeType })}>
              {TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <Label>Cause</Label>
            <select className="field" value={f.cause} onChange={(e) => setF({ ...f, cause: e.target.value as MistakeCause })}>
              {CAUSES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
        </div>
        <div>
          <Label>Why (short)</Label>
          <input className="field" value={f.explanation ?? ""} onChange={(e) => setF({ ...f, explanation: e.target.value })} placeholder="“Agree” is a verb: no “be”." />
        </div>
        <div>
          <Label hint="enables a translation exercise">French sentence behind it</Label>
          <input className="field" value={f.frenchHint ?? ""} onChange={(e) => setF({ ...f, frenchHint: e.target.value })} placeholder="Je suis d'accord avec toi." />
        </div>
        <div className="flex justify-between pt-2">
          {f.id ? (
            <Button variant="danger" size="sm" onClick={async () => { await deleteMistake(f.id!); onClose(); }}>
              <Icon name="trash" /> Delete
            </Button>
          ) : <span />}
          <Button
            variant="primary"
            disabled={!ok}
            onClick={async () => {
              await saveMistake({
                id: f.id,
                wrong: f.wrong!.trim(),
                correct: f.correct!.trim(),
                type: f.type ?? "grammar",
                cause: f.cause ?? "unknown",
                explanation: f.explanation?.trim() ?? "",
                frenchHint: f.frenchHint?.trim() || undefined,
                source: f.source ?? "user",
              });
              onClose();
            }}
          >
            Save
          </Button>
        </div>
      </div>
    </Modal>
  );
}
