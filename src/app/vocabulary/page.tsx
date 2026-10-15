"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db/schema";
import { deleteItem, deleteList, saveItem, saveList } from "@/lib/db/repo";
import type { Card as MemCard, CEFR, ItemKind, Register, VocabItem, VocabList } from "@/lib/types";
import { Button, Card, Chip, Empty, Label, LinkButton, Modal, Page, PageHeader, RegisterChip } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { STATE_LABEL } from "@/lib/engine/srs";
import { cx, relativeDays } from "@/lib/util";
import { useSettings } from "@/lib/hooks";
import { VocabularyImport } from "@/components/VocabularyImport";
import { AIDiagnostics } from "@/components/AIDiagnostics";
import { getProvider } from "@/lib/ai/provider";

const KINDS: ItemKind[] = ["word", "expression", "collocation", "phrasal-verb", "idiom", "sentence", "structure"];
const REGISTERS: Register[] = ["casual", "neutral", "professional", "formal", "academic", "literary"];
const LEVELS: CEFR[] = ["B1", "B1+", "B2", "B2+", "C1", "C1+", "C2"];
const COLORS = ["#4f6bed", "#8b5cf6", "#0ea5a4", "#e8793b", "#d9467a", "#ef4444", "#16a34a", "#475569", "#a16207"];

export default function VocabularyPage() {
  const lists = useLiveQuery(() => db.lists.orderBy("createdAt").toArray(), []) ?? [];
  const items = useLiveQuery(() => db.items.orderBy("createdAt").reverse().toArray(), []) ?? [];
  const cards = useLiveQuery(() => db.cards.where("refType").equals("item").toArray(), []);
  const [listId, setListId] = useState<string | "all">("all");
  const [importing, setImporting] = useState(false);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<ItemKind | "">("");
  const [level, setLevel] = useState<CEFR | "">("");
  const [register, setRegister] = useState<Register | "">("");
  const [source, setSource] = useState("");
  const [page, setPage] = useState(1);
  const [viewing, setViewing] = useState<VocabItem | null>(null);
  const [editing, setEditing] = useState<Partial<VocabItem> | null>(null);
  const [listEdit, setListEdit] = useState<Partial<VocabList> | null>(null);

  // deep links from the command palette: ?add=1 or ?q=word
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    requestAnimationFrame(() => {
      if (p.get("add")) setEditing({ listIds: [] });
      if (p.get("q")) setQ(p.get("q")!);
      if (p.get("list")) setListId(p.get("list")!);
    });
  }, []);

  const cardMap = useMemo(() => {
    const m = new Map<string, MemCard[]>();
    for (const c of cards ?? []) m.set(c.refId, [...(m.get(c.refId) ?? []), c]);
    return m;
  }, [cards]);

  const filtered = items.filter(
    (it) =>
      (listId === "all" || it.listIds.includes(listId)) &&
      (!kind || it.kind === kind) &&
      (!level || it.level === level) &&
      (!register || it.register === register) &&
      (!source || (source === "seed" ? it.source === "seed" : it.source !== "seed")) &&
      (!q || `${it.text} ${it.meaning} ${it.translationFr ?? ""} ${it.tags.join(" ")}`.toLowerCase().includes(q.toLowerCase())),
  ).sort((a, b) => a.text.localeCompare(b.text, "en"));
  const pageSize = 24;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const selectList = (id: string) => { setListId(id); setPage(1); };
  const current = lists.find((l) => l.id === listId);
  const orderedLists = [...lists].sort((a, b) => Number(b.id.startsWith("pack-")) - Number(a.id.startsWith("pack-")));

  return (
    <Page>
      <PageHeader title={<>Your <em>words</em></>} kicker={`Vocabulary · ${items.length} items · ${lists.length} lists`}>
        {listId !== "all" && (
          <LinkButton href={`/session?mode=list&list=${listId}`}>
            <Icon name="bolt" /> Practise this list
          </LinkButton>
        )}
        <Button onClick={() => setImporting(v => !v)}>{importing ? "Fermer l’import" : "Importer une liste"}</Button>
        <LinkButton href="/studio">Créer avec l’IA</LinkButton>
        <LinkButton href="/lessons">Leçons</LinkButton>
        <Button variant="primary" onClick={() => setEditing({ listIds: listId === "all" ? [] : [listId] })}>
          <Icon name="plus" /> Add
        </Button>
      </PageHeader>

      {importing && <div className="mb-8"><VocabularyImport listId={listId === "all" ? undefined : listId}/></div>}
      <div className="grid md:grid-cols-[220px_1fr] gap-6">
        {/* lists */}
        <aside className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible -mx-4 px-4 md:mx-0 md:px-0 pb-2 md:pb-0">
          <ListButton active={listId === "all"} onClick={() => selectList("all")} label="All items" count={items.length} color="var(--ink)" />
          {orderedLists.map((l) => (
            <ListButton key={l.id} active={listId === l.id} onClick={() => selectList(l.id)} label={l.name} count={items.filter((i) => i.listIds.includes(l.id)).length} color={l.color} />
          ))}
          <button onClick={() => setListEdit({ color: COLORS[lists.length % COLORS.length] })} className="text-left text-[13px] text-accent px-3 py-2 whitespace-nowrap">
            + New list
          </button>
        </aside>

        <div className="min-w-0">
          {current && (
            <div className="flex items-start justify-between mb-4 gap-4">
              <div>
                <h2 className="font-display text-[26px]">{current.name}</h2>
                {current.description && <p className="text-[13px] text-muted">{current.description}</p>}
              </div>
              <Button size="sm" variant="ghost" onClick={() => setListEdit(current)}>
                <Icon name="edit" /> Edit list
              </Button>
            </div>
          )}
          <div className="grid sm:grid-cols-2 gap-2 mb-3">
            <div className="relative min-w-0">
              <Icon name="search" className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
              <input aria-label="Rechercher dans le vocabulaire" className="field pl-9" placeholder="Search words, meanings, tags…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
            </div>
            <select aria-label="Type de vocabulaire" className="field" value={kind} onChange={(e) => { setKind(e.target.value as ItemKind | ""); setPage(1); }}>
              <option value="">All kinds</option>
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
            <select className="field" aria-label="Niveau du vocabulaire" value={level} onChange={e => { setLevel(e.target.value as CEFR | ""); setPage(1); }}><option value="">Tous niveaux</option>{LEVELS.map(l => <option key={l}>{l}</option>)}</select>
            <select className="field" aria-label="Registre du vocabulaire" value={register} onChange={e => { setRegister(e.target.value as Register | ""); setPage(1); }}><option value="">Tous registres</option>{REGISTERS.map(r => <option key={r}>{r}</option>)}</select>
            <select className="field col-span-2 sm:col-span-1" aria-label="Origine du vocabulaire" value={source} onChange={e => { setSource(e.target.value); setPage(1); }}><option value="">Toutes les fiches</option><option value="seed">Bibliothèque incluse</option><option value="personal">Mes ajouts & créations IA</option></select>
          </div>
          <div className="flex flex-wrap justify-between items-center text-xs text-faint mb-3 gap-2"><span aria-live="polite">{filtered.length} fiches · niveaux indicatifs</span>{(q || kind || level || register || source) && <button className="text-accent" onClick={() => { setQ(""); setKind(""); setLevel(""); setRegister(""); setSource(""); setPage(1); }}>Effacer les filtres</button>}</div>

          {filtered.length === 0 ? (
            <Empty title={items.length ? "No match" : "No items yet"}>Add a word, an expression or a sentence you want to own. It will show up in your sessions.</Empty>
          ) : (
            <Card className="divide-y divide-line">
              {visible.map((it) => (
                <ItemRow key={it.id} item={it} cards={cardMap.get(it.id) ?? []} onClick={() => setViewing(it)} />
              ))}
            </Card>
          )}
          {pageCount > 1 && <nav aria-label="Pages du vocabulaire" className="flex items-center justify-between gap-2 mt-5"><Button size="sm" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Précédent</Button><span className="text-xs text-muted">Page {currentPage} / {pageCount}</span><Button size="sm" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}>Suivant</Button></nav>}
          <p className="text-[12px] text-faint mt-3 flex gap-4 flex-wrap">
            <span>R = recognise · P = produce · U = use in context</span>
            <span className="flex items-center gap-1"><Dot state="new" /> new <Dot state="learning" /> learning <Dot state="familiar" /> familiar <Dot state="mastered" /> mastered</span>
          </p>
        </div>
      </div>

      {viewing && <Modal open title={viewing.text} onClose={() => setViewing(null)}>
        <div className="flex flex-wrap gap-2 mb-5"><Chip tone="accent">{viewing.level || "Niveau à préciser"}</Chip><Chip>{viewing.kind}</Chip><RegisterChip r={viewing.register}/></div>
        <p className="text-[18px]">{viewing.translationFr}</p><p className="text-sm text-muted mt-2" lang="en">{viewing.meaning}</p>
        {viewing.example && <div className="border-l-2 border-accent pl-5 mt-7"><p className="font-display text-[24px] leading-snug" lang="en">{viewing.example}</p>{viewing.exampleFr && <p className="text-sm text-muted mt-3">{viewing.exampleFr}</p>}</div>}
        {viewing.notes && <div className="rounded-xl bg-surface-2 p-5 mt-6"><p className="kicker mb-3">Nuance & construction</p><p className="text-sm leading-relaxed whitespace-pre-line">{viewing.notes}</p></div>}
        <p className="text-sm text-muted mt-5">Cachez cette fiche et réutilisez le terme dans une phrase sur votre vie. Retrouvez-le ensuite dans vos sessions.</p>
        <div className="flex flex-wrap gap-2 mt-6"><LinkButton href={`/session?mode=item&item=${encodeURIComponent(viewing.id)}`} variant="primary">Pratiquer cette fiche</LinkButton><Button onClick={() => { setEditing(viewing); setViewing(null); }}><Icon name="edit"/>Modifier</Button></div>
      </Modal>}
      <ItemForm key={editing?.id ?? (editing ? "new" : "closed")} item={editing} lists={lists} onClose={() => setEditing(null)} />
      <ListForm list={listEdit} onClose={() => setListEdit(null)} onDeleted={() => setListId("all")} />
    </Page>
  );
}

function ListButton({ active, onClick, label, count, color }: { active: boolean; onClick: () => void; label: string; count: number; color: string }) {
  return (
    <button
      onClick={onClick}
      className={cx(
        "flex items-center gap-2.5 rounded-lg px-3 py-2 text-[14px] text-left whitespace-nowrap transition-colors",
        active ? "bg-surface border border-line shadow-[var(--shadow)]" : "text-muted hover:bg-surface-2 hover:text-ink",
      )}
    >
      <span className="size-2 rounded-full shrink-0" style={{ background: color }} />
      <span className="flex-1 truncate">{label}</span>
      <span className="text-[12px] text-faint tabular-nums">{count}</span>
    </button>
  );
}

const DOT = { new: "bg-surface-2 border border-line", learning: "bg-warn", familiar: "bg-accent", mastered: "bg-good" };
function Dot({ state }: { state: MemCard["state"] }) {
  return <span className={cx("inline-block size-2 rounded-full", DOT[state])} />;
}

function ItemRow({ item, cards, onClick }: { item: VocabItem; cards: MemCard[]; onClick: () => void }) {
  const byFacet = (f: string) => cards.find((c) => c.facet === f);
  const next = cards.filter((c) => !c.suspended && c.state !== "new").sort((a, b) => a.due - b.due)[0];
  const leech = cards.some((c) => c.leech);
  return (
    <button onClick={onClick} className="group w-full text-left px-6 py-5 hover:bg-surface-2/60 transition-colors flex gap-4 items-start">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-display text-[21px] leading-tight group-hover:text-accent transition-colors">{item.text}</span>
          <Chip>{item.kind}</Chip>
          {item.register !== "neutral" && <RegisterChip r={item.register} />}
          {leech && <Chip tone="bad">keeps slipping</Chip>}
        </div>
        <p className="text-[14px] text-muted mt-1.5 truncate">{item.meaning}</p>
        {item.translationFr && <p className="text-[12px] text-faint truncate">FR: {item.translationFr}</p>}
      </div>
      <div className="text-right shrink-0">
        <div className="flex gap-2 justify-end text-[11px] text-faint">
          {(["recognize", "produce", "use"] as const).map((f) => {
            const c = byFacet(f);
            return (
              <span key={f} className="flex items-center gap-1" title={`${f}: ${c ? (c.suspended ? "locked" : STATE_LABEL[c.state]) : "–"}`}>
                {f[0].toUpperCase()}
                <Dot state={c?.suspended ? "new" : (c?.state ?? "new")} />
              </span>
            );
          })}
        </div>
        <p className="mono text-[10.5px] text-faint mt-2">{item.level || "—"} · {next ? `review ${relativeDays(next.due)}` : "not started"}</p>
      </div>
    </button>
  );
}

function ItemForm({ item, lists, onClose }: { item: Partial<VocabItem> | null; lists: VocabList[]; onClose: () => void }) {
  const settings = useSettings();
  const ai = getProvider(settings);
  const controller=useRef<AbortController|null>(null);
  useEffect(()=>()=>controller.current?.abort(),[]);
  const [aiError, setAiError] = useState("");
  const [f, setF] = useState<Partial<VocabItem>>({});
  const [tags, setTags] = useState("");
  const [busy, setBusy] = useState(false);
  const [opened, setOpened] = useState<Partial<VocabItem> | null>(null);

  // reset the form when a new item is opened
  if (item !== opened) {
    setOpened(item);
    if (item) {
      setF({ kind: "expression", register: "neutral", level: "C1", listIds: [], ...item });
      setTags((item.tags ?? []).join(", "));
    }
  }
  if (!item) return null;

  const set = <K extends keyof VocabItem>(k: K, v: VocabItem[K]) => setF((x) => ({ ...x, [k]: v }));

  async function save() {
    if (!f.text?.trim() || (!f.meaning?.trim() && !f.translationFr?.trim())) return;
    await saveItem({
      id: f.id,
      kind: f.kind as ItemKind,
      text: f.text.trim(),
      meaning: f.meaning?.trim() || "",
      translationFr: f.translationFr?.trim() || undefined,
      example: f.example?.trim() || undefined,
      exampleFr: f.exampleFr?.trim() || undefined,
      register: f.register as Register,
      level: f.level as CEFR,
      tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      listIds: f.listIds ?? [],
      notes: f.notes?.trim() || undefined,
    });
    onClose();
  }

  async function suggestExample() {
    if (!ai || !f.text?.trim() || busy) return;
    const abort=new AbortController();controller.current=abort;
    setBusy(true);
    setAiError("");
    try {
      const ex = await ai.generateExamples({ ...(f as VocabItem), meaning: f.meaning ?? "" }, 1,abort.signal);
      if(abort.signal.aborted)return;
      if (ex[0]) set("example", ex[0]);
    } catch (e) {
      setAiError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open title={f.id ? "Edit item" : "New item"} onClose={onClose}>
      <div className="space-y-4">
        {busy&&<Button size="sm" onClick={()=>controller.current?.abort()}>Annuler la suggestion</Button>}
        {ai&&<AIDiagnostics/>}
        {aiError && <p className="text-sm text-warn" role="alert">{aiError} <a className="link" href="/settings#ai">Réglages IA</a>. Cliquez sur Suggest with AI pour réessayer.</p>}
        <div>
          <Label>Expression</Label>
          <input disabled={busy} className="field text-[16px] font-medium" value={f.text ?? ""} onChange={(e) => set("text", e.target.value)} placeholder="to come across" autoFocus />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <Label>Kind</Label>
            <select className="field" value={f.kind} onChange={(e) => set("kind", e.target.value as ItemKind)}>
              {KINDS.map((k) => <option key={k}>{k}</option>)}
            </select>
          </div>
          <div>
            <Label>Register</Label>
            <select className="field" value={f.register} onChange={(e) => set("register", e.target.value as Register)}>
              {REGISTERS.map((k) => <option key={k}>{k}</option>)}
            </select>
          </div>
          <div>
            <Label>Level</Label>
            <select className="field" value={f.level} onChange={(e) => set("level", e.target.value as CEFR)}>
              {LEVELS.map((k) => <option key={k}>{k}</option>)}
            </select>
          </div>
        </div>
        <div>
          <Label>Meaning</Label>
          <input className="field" value={f.meaning ?? ""} onChange={(e) => set("meaning", e.target.value)} placeholder="to encounter; to give a particular impression" />
        </div>
        <div>
          <Label hint="used as a cue for production exercises">French</Label>
          <input className="field" value={f.translationFr ?? ""} onChange={(e) => set("translationFr", e.target.value)} placeholder="tomber sur ; donner l'impression d'être" />
        </div>
        <div>
          <div className="flex justify-between items-end">
            <Label hint="the item is masked in it for cloze exercises">Example</Label>
            {ai ? (
              <button className="text-[12px] text-accent mb-1.5" onClick={suggestExample} disabled={busy}>
                {busy ? "…" : "Suggest with AI"}
              </button>
            ) : <a className="text-xs text-muted link" href="/settings#ai">IA indisponible · Configurer</a>}
          </div>
          <input className="field" value={f.example ?? ""} onChange={(e) => set("example", e.target.value)} placeholder="He came across as extremely confident." />
        </div>
        <div><Label>Traduction de l’exemple</Label><input className="field" value={f.exampleFr ?? ""} onChange={e => set("exampleFr", e.target.value)}/></div>
        <div>
          <Label hint="comma separated">Tags</Label>
          <input className="field" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="phrasal verb, personality" />
        </div>
        <div>
          <Label>Lists</Label>
          <div className="flex flex-wrap gap-1.5">
            {lists.map((l) => {
              const on = f.listIds?.includes(l.id);
              return (
                <button
                  key={l.id}
                  onClick={() => set("listIds", on ? (f.listIds ?? []).filter((x) => x !== l.id) : [...(f.listIds ?? []), l.id])}
                  className={cx("text-[13px] rounded-lg px-2.5 py-1 border transition-colors flex items-center gap-1.5", on ? "border-accent bg-accent-soft text-accent" : "border-line text-muted")}
                >
                  <span className="size-1.5 rounded-full" style={{ background: l.color }} />
                  {l.name}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <Label>Notes</Label>
          <textarea className="field min-h-16" value={f.notes ?? ""} onChange={(e) => set("notes", e.target.value)} />
        </div>
        <div className="flex justify-between pt-2">
          {f.id ? (
            <Button variant="danger" size="sm" onClick={async () => { await deleteItem(f.id!); onClose(); }}>
              <Icon name="trash" /> Delete
            </Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button variant="primary" onClick={save} disabled={!f.text?.trim() || (!f.meaning?.trim() && !f.translationFr?.trim())}>Save</Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function ListForm({ list, onClose, onDeleted }: { list: Partial<VocabList> | null; onClose: () => void; onDeleted: () => void }) {
  const [f, setF] = useState<Partial<VocabList>>({});
  const [opened, setOpened] = useState<Partial<VocabList> | null>(null);
  if (list !== opened) {
    setOpened(list);
    if (list) setF(list);
  }
  if (!list) return null;
  return (
    <Modal open title={f.id ? "Edit list" : "New list"} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <Label>Name</Label>
          <input className="field" value={f.name ?? ""} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus placeholder="Tech vocabulary" />
        </div>
        <div>
          <Label>Description</Label>
          <input className="field" value={f.description ?? ""} onChange={(e) => setF({ ...f, description: e.target.value })} />
        </div>
        <div>
          <Label>Colour</Label>
          <div className="flex gap-2">
            {COLORS.map((c) => (
              <button key={c} onClick={() => setF({ ...f, color: c })} className={cx("size-6 rounded-full", f.color === c && "ring-2 ring-offset-2 ring-accent")} style={{ background: c }} aria-label={c} />
            ))}
          </div>
        </div>
        <div className="flex justify-between pt-2">
          {f.id ? (
            <Button variant="danger" size="sm" onClick={async () => { await deleteList(f.id!); onDeleted(); onClose(); }}>
              Delete list
            </Button>
          ) : <span />}
          <Button variant="primary" disabled={!f.name?.trim()} onClick={async () => { await saveList({ ...f, name: f.name!.trim() }); onClose(); }}>
            Save
          </Button>
        </div>
      </div>
    </Modal>
  );
}
