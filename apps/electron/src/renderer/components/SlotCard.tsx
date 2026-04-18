import { useEffect, useRef, useState } from "react";
import type {
  PokemonMaster,
  PokemonSet,
  StatKey,
  StatPoints,
} from "@edv4h/poke-mate-shared-types";
import { usePartyStore } from "../stores/party-store.js";
import { STAT_FULL_JA, TYPE_NAME_JA } from "../i18n.js";
import { NATURES, formatNature } from "../natures.js";

interface Props {
  slot: number;
  set: PokemonSet | undefined;
  flash: boolean;
}

const STAT_KEYS: StatKey[] = ["hp", "atk", "def", "spa", "spd", "spe"];
const MAX_EV_PER_STAT = 252;
const MAX_EV_TOTAL = 508;

function natureJa(id: string | undefined): string {
  if (!id) return "性格未設定";
  const n = NATURES.find((x) => x.id === id);
  return n ? formatNature(n) : id;
}

export function SlotCard({ slot, set, flash }: Props): JSX.Element {
  const upsertSlot = usePartyStore((s) => s.upsertSlot);
  const clearSlot = usePartyStore((s) => s.clearSlot);
  const masterIndex = usePartyStore((s) => s.masterIndex);
  const [searching, setSearching] = useState(false);
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<PokemonMaster[]>([]);
  const searchTokenRef = useRef(0);
  const master = set ? masterIndex[set.speciesId] : undefined;

  // Editable draft synced from `set` whenever the panel opens or set changes.
  const [draftNature, setDraftNature] = useState("");
  const [draftAbility, setDraftAbility] = useState("");
  const [draftItem, setDraftItem] = useState("");
  const [draftMoves, setDraftMoves] = useState<string[]>(["", "", "", ""]);
  const [draftEvs, setDraftEvs] = useState<Record<StatKey, number>>({
    hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0,
  });

  // 編集パネルを開いた瞬間、または別のポケモンに差し替わった (set.id 変化) タイミング
  // でのみ draft を set から同期する。editing 中に MCP の更新イベント等で set の
  // 中身が書き換わっても、ユーザーが編集中の draft を上書きしない。
  const setId = set?.id;
  useEffect(() => {
    if (!editing || !set) return;
    setDraftNature(set.natureId ?? "");
    setDraftAbility(set.abilityId ?? "");
    setDraftItem(set.itemId ?? "");
    const moves = [...set.movesJson];
    while (moves.length < 4) moves.push("");
    setDraftMoves(moves.slice(0, 4));
    const evs: Record<StatKey, number> = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
    for (const k of STAT_KEYS) evs[k] = set.spJson[k] ?? 0;
    setDraftEvs(evs);
    // set 全体ではなく set.id のみに依存させる。set の中身変更では再 sync しない。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, setId]);

  const evTotal = STAT_KEYS.reduce((a, k) => a + (draftEvs[k] ?? 0), 0);
  const evOver = evTotal > MAX_EV_TOTAL;

  async function doSearch(q: string): Promise<void> {
    setQuery(q);
    const trimmed = q.trim();
    if (trimmed === "") {
      searchTokenRef.current += 1;
      setCandidates([]);
      return;
    }
    const token = ++searchTokenRef.current;
    const results = await window.pokeMate.searchPokemon({
      query: trimmed,
      championsOnly: true,
      limit: 10,
    });
    if (token !== searchTokenRef.current) return;
    setCandidates(results);
  }

  async function pick(chosen: PokemonMaster): Promise<void> {
    // upsertSlot の最後で openParty が走り、その openParty 内で ensureMasters が
    // 呼ばれるため、ここでの明示的な ensureMasters は冗長。
    await upsertSlot(slot, chosen.id);
    // 差し替え時は set.id は不変 (upsert 実装が同じ行を UPDATE するため) なので
    // useEffect の set.id 依存では draft 同期が走らない。旧 draft を新ポケモンに
    // 上書きするのを防ぐため、編集パネルを明示的に閉じて draft を捨てる。
    setEditing(false);
    setSearching(false);
    setQuery("");
    setCandidates([]);
  }

  async function saveEdit(): Promise<void> {
    if (!set) return;
    if (evOver) return;
    const moves = draftMoves.map((m) => m.trim()).filter((m) => m !== "");
    const spJson: StatPoints = {};
    for (const k of STAT_KEYS) {
      const v = draftEvs[k] ?? 0;
      if (v > 0) spJson[k] = v;
    }
    // 空文字は「未設定」扱いとして extra に入れずに送る。空文字を送ると DB 側で
    // null ではなく "" が残り、表示側の `?? "未設定"` フォールバックが効かない。
    const trimmedItem = draftItem.trim();
    // upsert は現状「全フィールド書き戻し」動作なので、編集 UI が触らない
    // formeId / isMegaTarget は既存値を明示的に送り、データ消失を防ぐ。
    await upsertSlot(slot, set.speciesId, {
      ...(set.formeId !== undefined && { formeId: set.formeId }),
      ...(draftNature !== "" && { natureId: draftNature }),
      ...(draftAbility !== "" && { abilityId: draftAbility }),
      ...(trimmedItem !== "" && { itemId: trimmedItem }),
      moves,
      isMegaTarget: set.isMegaTarget,
      spJson,
    });
    setEditing(false);
  }

  const classes = ["slot-card"];
  if (!set) classes.push("empty");
  if (flash) classes.push("flash");

  return (
    <div className={classes.join(" ")}>
      <header className="slot-header">
        <span className="slot-num">#{slot}</span>
        {set && <button onClick={() => void clearSlot(slot)}>削除</button>}
      </header>

      {set ? (
        <div className="slot-body">
          <strong>{master?.nameJa ?? set.speciesId}</strong>
          {master && (
            <div className="slot-types">
              {master.types.map((t) => (
                <span key={t} className={`type type-${t}`}>
                  {TYPE_NAME_JA[t]}
                </span>
              ))}
            </div>
          )}
          <div className="slot-meta">
            {natureJa(set.natureId)} / {set.abilityId ?? "特性未設定"} /{" "}
            {set.itemId ?? "持ち物未設定"}
          </div>
          <div className="slot-moves">
            {set.movesJson.length === 0
              ? "技未設定"
              : set.movesJson.slice(0, 4).join(" / ")}
          </div>
          <div className="slot-actions">
            <button onClick={() => setEditing((e) => !e)}>
              {editing ? "閉じる" : "編集"}
            </button>
            <button onClick={() => setSearching((s) => !s)}>差し替え</button>
          </div>
        </div>
      ) : (
        <button className="slot-empty-btn" onClick={() => setSearching(true)}>
          + 空きスロット
        </button>
      )}

      {searching && (
        <div className="slot-search">
          <input
            type="search"
            aria-label={`スロット${slot}のポケモン検索`}
            placeholder="ポケモン検索"
            value={query}
            onChange={(e) => void doSearch(e.target.value)}
            autoFocus
          />
          <ul>
            {candidates.map((p) => (
              <li key={p.id}>
                <button onClick={() => void pick(p)}>
                  {p.nameJa} <span className="en">{p.nameEn}</span>
                </button>
              </li>
            ))}
          </ul>
          <button className="cancel" onClick={() => setSearching(false)}>
            キャンセル
          </button>
        </div>
      )}

      {editing && set && (
        <div className="slot-edit">
          <label>
            <span>性格</span>
            <select
              value={draftNature}
              onChange={(e) => setDraftNature(e.target.value)}
            >
              <option value="">(未設定)</option>
              {NATURES.map((n) => (
                <option key={n.id} value={n.id}>
                  {formatNature(n)}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>特性</span>
            <select
              value={draftAbility}
              onChange={(e) => setDraftAbility(e.target.value)}
              disabled={!master}
              aria-busy={!master}
            >
              <option value="">{master ? "(未設定)" : "読み込み中…"}</option>
              {/* master が未ロードの間に DB から読んだ既存 abilityId を維持表示する */}
              {!master && draftAbility !== "" && (
                <option value={draftAbility}>{draftAbility}</option>
              )}
              {(master?.abilities ?? []).map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>持ち物</span>
            <input
              type="text"
              value={draftItem}
              placeholder="例: こだわりスカーフ"
              onChange={(e) => setDraftItem(e.target.value)}
            />
          </label>

          <fieldset className="slot-moves-edit">
            <legend>わざ</legend>
            {[0, 1, 2, 3].map((i) => (
              <input
                key={i}
                type="text"
                aria-label={`わざ${i + 1}`}
                value={draftMoves[i] ?? ""}
                placeholder={`わざ${i + 1}`}
                onChange={(e) => {
                  const next = [...draftMoves];
                  next[i] = e.target.value;
                  setDraftMoves(next);
                }}
              />
            ))}
          </fieldset>

          <fieldset className="slot-ev-edit">
            <legend>
              努力値 ({evTotal}/{MAX_EV_TOTAL})
              {evOver && <span className="ev-over"> — 合計上限超過</span>}
            </legend>
            {STAT_KEYS.map((k) => (
              <label key={k}>
                <span>{STAT_FULL_JA[k]}</span>
                <input
                  type="number"
                  min={0}
                  max={MAX_EV_PER_STAT}
                  step={4}
                  value={draftEvs[k]}
                  onChange={(e) => {
                    const v = Math.max(0, Math.min(MAX_EV_PER_STAT, Number(e.target.value) || 0));
                    setDraftEvs((prev) => ({ ...prev, [k]: v }));
                  }}
                />
              </label>
            ))}
          </fieldset>

          <div className="slot-edit-actions">
            <button onClick={() => void saveEdit()} disabled={evOver}>
              保存
            </button>
            <button className="cancel" onClick={() => setEditing(false)}>
              キャンセル
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
