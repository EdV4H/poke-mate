import { useEffect } from "react";
import { usePartyStore } from "../stores/party-store.js";

export function Toast(): JSX.Element | null {
  const toast = usePartyStore((s) => s.toast);
  const setToast = usePartyStore((s) => s.setToast);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast, setToast]);

  if (!toast) return null;
  return (
    <div className="toast" role="status" aria-live="polite">
      {toast}
    </div>
  );
}
