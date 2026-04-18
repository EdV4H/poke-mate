import { useEffect, useState } from "react";
import type { PokemonMaster } from "@edv4h/poke-mate-shared-types";

export function SearchPage(): JSX.Element {
  const [query, setQuery] = useState("");
  const [championsOnly, setChampionsOnly] = useState(true);
  const [results, setResults] = useState<PokemonMaster[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed === "") {
      setResults([]);
      setLoading(false);
      return;
    }
    const controller = { cancelled: false };
    setLoading(true);
    void window.pokeMate
      .searchPokemon({ query: trimmed, championsOnly, limit: 50 })
      .then((r) => {
        if (!controller.cancelled) setResults(r);
      })
      .finally(() => {
        if (!controller.cancelled) setLoading(false);
      });
    return () => {
      controller.cancelled = true;
    };
  }, [query, championsOnly]);

  return (
    <section className="page">
      <header>
        <h2>ポケモン検索</h2>
      </header>
      <div className="search-bar">
        <input
          type="search"
          aria-label="ポケモン検索"
          placeholder="ポケモン名 / 英名 / ID で検索"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
        <label>
          <input
            type="checkbox"
            checked={championsOnly}
            onChange={(e) => setChampionsOnly(e.target.checked)}
          />
          Champions プールのみ
        </label>
      </div>

      {loading ? (
        <p className="status">検索中…</p>
      ) : results.length === 0 ? (
        <p className="status">{query.trim() ? "該当なし" : "キーワードを入力してください"}</p>
      ) : (
        <ul className="results">
          {results.map((p) => (
            <li key={p.id}>
              <div className="name">
                <strong>{p.nameJa}</strong>
                <span className="en">{p.nameEn}</span>
                <span className="dex">#{p.dexNo}</span>
              </div>
              <div className="types">
                {p.types.map((t) => (
                  <span key={t} className={`type type-${t}`}>
                    {t}
                  </span>
                ))}
              </div>
              <div className="stats">
                H {p.baseStats.hp} / A {p.baseStats.atk} / B {p.baseStats.def} / C{" "}
                {p.baseStats.spa} / D {p.baseStats.spd} / S {p.baseStats.spe}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
