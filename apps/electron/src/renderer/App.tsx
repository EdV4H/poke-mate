import { useEffect, useState } from "react";
import { SearchPage } from "./pages/SearchPage.js";
import { PartyListPage } from "./pages/PartyListPage.js";
import { PartyBuilderPage } from "./pages/PartyBuilderPage.js";
import { Toast } from "./components/Toast.js";
import { usePartyStore } from "./stores/party-store.js";

type View =
  | { kind: "search" }
  | { kind: "parties" }
  | { kind: "builder"; partyId: string };

export function App(): JSX.Element {
  const init = usePartyStore((s) => s.init);
  const [view, setView] = useState<View>({ kind: "parties" });

  useEffect(() => {
    void init();
  }, [init]);

  return (
    <main className="container">
      <header className="app-header">
        <h1>poke-mate</h1>
        <nav>
          <button
            className={view.kind === "parties" || view.kind === "builder" ? "active" : ""}
            onClick={() => setView({ kind: "parties" })}
          >
            パーティ
          </button>
          <button
            className={view.kind === "search" ? "active" : ""}
            onClick={() => setView({ kind: "search" })}
          >
            検索
          </button>
        </nav>
      </header>

      {view.kind === "search" && <SearchPage />}
      {view.kind === "parties" && (
        <PartyListPage onOpen={(partyId) => setView({ kind: "builder", partyId })} />
      )}
      {view.kind === "builder" && (
        <PartyBuilderPage
          partyId={view.partyId}
          onBack={() => setView({ kind: "parties" })}
        />
      )}

      <Toast />
    </main>
  );
}
