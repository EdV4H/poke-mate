import { useRef, useState } from "react";
import type { PokemonMaster, PokemonSet } from "@edv4h/poke-mate-shared-types";
import { usePartyStore } from "../stores/party-store.js";
import { TYPE_NAME_JA } from "../i18n.js";

interface Props {
  slot: number;
  set: PokemonSet | undefined;
  flash: boolean;
}

export function SlotCard({ slot, set, flash }: Props): JSX.Element {
  const upsertSlot = usePartyStore((s) => s.upsertSlot);
  const clearSlot = usePartyStore((s) => s.clearSlot);
  const masterIndex = usePartyStore((s) => s.masterIndex);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<PokemonMaster[]>([]);
  const searchTokenRef = useRef(0);
  const master = set ? masterIndex[set.speciesId] : undefined;

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
    await upsertSlot(slot, chosen.id);
    await usePartyStore.getState().ensureMasters([chosen.id]);
    setSearching(false);
    setQuery("");
    setCandidates([]);
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
            {set.natureId ?? "性格未設定"} / {set.abilityId ?? "特性未設定"} /{" "}
            {set.itemId ?? "持ち物未設定"}
          </div>
          <div className="slot-moves">
            {set.movesJson.length === 0
              ? "技未設定"
              : set.movesJson.slice(0, 4).join(" / ")}
          </div>
          <button onClick={() => setSearching((s) => !s)}>差し替え</button>
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
    </div>
  );
}
