import { useState, type FormEvent } from "react";
import { usePartyStore } from "../stores/party-store.js";

interface Props {
  onOpen: (partyId: string) => void;
}

export function PartyListPage({ onOpen }: Props): JSX.Element {
  const parties = usePartyStore((s) => s.parties);
  const createParty = usePartyStore((s) => s.createParty);
  const [name, setName] = useState("");
  const [format, setFormat] = useState<"single" | "double">("single");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      const id = await createParty(name.trim(), format);
      setName("");
      onOpen(id);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="page">
      <header>
        <h2>パーティ一覧</h2>
        <p className="subtitle">AI と一緒に組むためのパーティを作成・管理</p>
      </header>

      <form className="create-form" onSubmit={(e) => void submit(e)}>
        <input
          type="text"
          aria-label="新規パーティ名"
          placeholder="新しいパーティ名"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <select
          value={format}
          onChange={(e) => setFormat(e.target.value as "single" | "double")}
          aria-label="対戦形式"
        >
          <option value="single">シングル</option>
          <option value="double">ダブル</option>
        </select>
        <button type="submit" disabled={busy || !name.trim()}>
          作成
        </button>
      </form>

      {parties.length === 0 ? (
        <p className="status">まだパーティがありません。上で作成してください。</p>
      ) : (
        <ul className="party-list">
          {parties.map((p) => (
            <li key={p.id}>
              <button className="party-row" onClick={() => onOpen(p.id)}>
                <strong>{p.name}</strong>
                <span className="meta">
                  {p.format === "single" ? "シングル" : "ダブル"} ·{" "}
                  {p.sets.length}/6 匹 · v{p.version}
                </span>
                <code className="party-id">{p.id}</code>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
