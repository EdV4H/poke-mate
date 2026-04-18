import { useEffect } from "react";
import { usePartyStore } from "../stores/party-store.js";
import { SlotCard } from "../components/SlotCard.js";

interface Props {
  partyId: string;
  onBack: () => void;
}

export function PartyBuilderPage({ partyId, onBack }: Props): JSX.Element {
  const currentParty = usePartyStore((s) => s.currentParty);
  const openParty = usePartyStore((s) => s.openParty);
  const closeParty = usePartyStore((s) => s.closeParty);
  const flash = usePartyStore((s) => s.flash);
  const setToast = usePartyStore((s) => s.setToast);

  useEffect(() => {
    void openParty(partyId);
    return () => {
      closeParty();
    };
  }, [partyId, openParty, closeParty]);

  if (!currentParty) {
    return (
      <section className="page">
        <p className="status">読み込み中…</p>
      </section>
    );
  }

  const slotsBySlot = new Map(currentParty.sets.map((s) => [s.slot, s]));

  async function copyId(): Promise<void> {
    try {
      await navigator.clipboard.writeText(currentParty!.id);
      setToast("パーティID をコピーしました");
    } catch {
      setToast("パーティID のコピーに失敗しました");
    }
  }

  return (
    <section className="page builder">
      <header className="builder-header">
        <button className="back" onClick={onBack}>
          ← 一覧に戻る
        </button>
        <h2>{currentParty.name}</h2>
        <span className="meta">
          {currentParty.format === "single" ? "シングル" : "ダブル"} · v{currentParty.version}
        </span>
        <button className="ai-cta" onClick={() => void copyId()} title="Claude に貼り付けるための party_id をコピー">
          🤖 AIに相談（ID コピー）
        </button>
      </header>

      <p className="hint">
        Claude Desktop に <code>build-party-with-me party_id={currentParty.id}</code>{" "}
        のように依頼してください。AI が書き換えると即座に反映されます。
      </p>

      <div className="slot-grid">
        {[1, 2, 3, 4, 5, 6].map((slot) => (
          <SlotCard
            key={slot}
            slot={slot}
            set={slotsBySlot.get(slot)}
            flash={flash?.slot === slot}
          />
        ))}
      </div>
    </section>
  );
}
