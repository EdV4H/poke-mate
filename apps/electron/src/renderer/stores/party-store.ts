import { create } from "zustand";
import type { ChangeEvent, Party } from "@edv4h/poke-mate-shared-types";

const DEFAULT_WORKSPACE_ID = "default";

export interface FlashState {
  slot: number;
  at: number;
  message: string;
}

interface PartyStoreState {
  parties: Party[];
  currentPartyId: string | null;
  currentParty: Party | null;
  lastEventId: number;
  loading: boolean;
  flash: FlashState | null;
  toast: string | null;

  init(): Promise<void>;
  refreshList(): Promise<void>;
  openParty(partyId: string): Promise<void>;
  closeParty(): void;
  createParty(name: string, format: "single" | "double"): Promise<string>;
  upsertSlot(
    slot: number,
    speciesId: string,
    extra?: Partial<{
      natureId: string;
      abilityId: string;
      itemId: string;
      moves: string[];
      isMegaTarget: boolean;
    }>,
  ): Promise<void>;
  clearSlot(slot: number): Promise<void>;
  handleChangeEvent(event: ChangeEvent): Promise<void>;
  setToast(msg: string | null): void;
}

const FLASH_DURATION_MS = 1800;

export const usePartyStore = create<PartyStoreState>((set, get) => ({
  parties: [],
  currentPartyId: null,
  currentParty: null,
  lastEventId: 0,
  loading: false,
  flash: null,
  toast: null,

  async init() {
    await get().refreshList();
    window.pokeMate.onChangeEvent((event) => {
      void get().handleChangeEvent(event);
    });
  },

  async refreshList() {
    set({ loading: true });
    const list = await window.pokeMate.listParties({ workspaceId: DEFAULT_WORKSPACE_ID });
    set({ parties: list, loading: false });
  },

  async openParty(partyId) {
    const party = await window.pokeMate.getParty({ partyId });
    if (!party) {
      set({
        currentPartyId: null,
        currentParty: null,
        flash: null,
        toast: "パーティを読み込めませんでした（削除された可能性があります）",
      });
      return;
    }
    set({ currentPartyId: partyId, currentParty: party });
  },

  closeParty() {
    set({ currentPartyId: null, currentParty: null, flash: null });
  },

  async createParty(name, format) {
    const result = await window.pokeMate.createParty({ name, format });
    set((s) => ({
      parties: [...s.parties, result],
      lastEventId: Math.max(s.lastEventId, result.changeEventId),
    }));
    return result.id;
  },

  async upsertSlot(slot, speciesId, extra) {
    const party = get().currentParty;
    if (!party) return;
    const existing = party.sets.find((x) => x.slot === slot);
    const result = await window.pokeMate.upsertPartySlot({
      partyId: party.id,
      slot,
      set: {
        speciesId,
        ...(extra?.natureId !== undefined && { natureId: extra.natureId }),
        ...(extra?.abilityId !== undefined && { abilityId: extra.abilityId }),
        ...(extra?.itemId !== undefined && { itemId: extra.itemId }),
        ...(extra?.moves !== undefined && { movesJson: extra.moves }),
        ...(extra?.isMegaTarget !== undefined && { isMegaTarget: extra.isMegaTarget }),
      },
      ...(existing !== undefined && { expectedVersion: existing.version }),
    });
    set((s) => ({ lastEventId: Math.max(s.lastEventId, result.changeEventId) }));
    await get().openParty(party.id);
  },

  async clearSlot(slot) {
    const party = get().currentParty;
    if (!party) return;
    const result = await window.pokeMate.deletePartySlot({ partyId: party.id, slot });
    set((s) => ({ lastEventId: Math.max(s.lastEventId, result.changeEventId) }));
    await get().openParty(party.id);
  },

  async handleChangeEvent(event) {
    set((s) => ({ lastEventId: Math.max(s.lastEventId, event.id) }));

    if (event.actor !== "mcp") return;

    const current = get().currentParty;
    if (event.entityType === "party" && event.entityId === current?.id) {
      await get().openParty(current.id);
      set({ toast: "Claude がパーティを更新しました" });
    } else if (event.entityType === "pokemon_set" && current) {
      const refreshed = await window.pokeMate.getParty({ partyId: current.id });
      if (!refreshed) return;
      let changedSlot: number | null = null;
      for (const s of refreshed.sets) {
        if (s.id === event.entityId) {
          changedSlot = s.slot;
          break;
        }
      }
      set({
        currentParty: refreshed,
        toast: changedSlot
          ? `Claude がスロット${changedSlot}を更新しました`
          : "Claude がパーティを更新しました",
        ...(changedSlot !== null && {
          flash: { slot: changedSlot, at: Date.now(), message: "Claude の更新" },
        }),
      });
      if (changedSlot !== null) {
        setTimeout(() => {
          const st = get();
          if (st.flash && st.flash.slot === changedSlot) set({ flash: null });
        }, FLASH_DURATION_MS);
      }
    } else if (event.entityType === "party" && event.op === "create") {
      await get().refreshList();
      set({ toast: "Claude が新しいパーティを作成しました" });
    }
  },

  setToast(msg) {
    set({ toast: msg });
  },
}));
