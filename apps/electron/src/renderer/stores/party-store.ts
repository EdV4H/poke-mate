import { create } from "zustand";
import type { ChangeEvent, Party, PokemonMaster, StatPoints } from "@edv4h/poke-mate-shared-types";

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
  lastSlotEventTs: string | null;
  loading: boolean;
  flash: FlashState | null;
  toast: string | null;
  masterIndex: Record<string, PokemonMaster>;

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
      spJson: StatPoints;
    }>,
  ): Promise<void>;
  clearSlot(slot: number): Promise<void>;
  handleChangeEvent(event: ChangeEvent): Promise<void>;
  setToast(msg: string | null): void;
  ensureMasters(speciesIds: string[]): Promise<void>;
}

const FLASH_DURATION_MS = 1800;

export const usePartyStore = create<PartyStoreState>((set, get) => ({
  parties: [],
  currentPartyId: null,
  currentParty: null,
  lastEventId: 0,
  lastSlotEventTs: null,
  loading: false,
  flash: null,
  toast: null,
  masterIndex: {},

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
    await get().ensureMasters(party.sets.map((s) => s.speciesId));
  },

  async ensureMasters(speciesIds) {
    const { masterIndex } = get();
    const missing = Array.from(new Set(speciesIds)).filter((id) => !(id in masterIndex));
    if (missing.length === 0) return;
    const fetched = await Promise.all(
      missing.map((id) => window.pokeMate.getPokemonDetails({ speciesId: id })),
    );
    const updates: Record<string, PokemonMaster> = {};
    fetched.forEach((m, i) => {
      if (m) updates[missing[i]!] = m;
    });
    if (Object.keys(updates).length > 0) {
      set((s) => ({ masterIndex: { ...s.masterIndex, ...updates } }));
    }
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
        ...(extra?.spJson !== undefined && { spJson: extra.spJson }),
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

    const state = get();
    const current = state.currentParty;
    const isCurrent = event.entityType === "party" && event.entityId === current?.id;

    // pokemon_set の mutation は PartyService が party:update イベントも発火する。
    // 同じ ts を持つ直後の party:update は pokemon_set で既に処理済みなのでスキップ。
    if (event.entityType === "pokemon_set") {
      set({ lastSlotEventTs: event.ts });
    } else if (
      event.entityType === "party" &&
      event.op === "update" &&
      event.ts === state.lastSlotEventTs
    ) {
      await get().refreshList();
      return;
    }

    if (isCurrent && event.op === "update") {
      await get().openParty(current!.id);
      await get().refreshList();
      set({ toast: "Claude がパーティを更新しました" });
    } else if (isCurrent && event.op === "delete") {
      await get().refreshList();
      set({
        currentPartyId: null,
        currentParty: null,
        flash: null,
        toast: "Claude がパーティを削除しました",
      });
    } else if (event.entityType === "pokemon_set" && current) {
      const refreshed = await window.pokeMate.getParty({ partyId: current.id });
      if (!refreshed) return;
      // MCP 経由の変更で新しい speciesId が入ってきた場合、masterIndex に
      // 無いとスロット表示が speciesId フォールバックになる。ここで補完する。
      await get().ensureMasters(refreshed.sets.map((s) => s.speciesId));
      let changedSlot: number | null = null;
      for (const s of refreshed.sets) {
        if (s.id === event.entityId) {
          changedSlot = s.slot;
          break;
        }
      }
      // pokemon_set イベントが現在のパーティに紐づかない場合、汎用トーストで
      // ユーザーを混乱させないよう通知を出さず、state だけ同期する。
      if (changedSlot === null) {
        set({ currentParty: refreshed });
        return;
      }
      set({
        currentParty: refreshed,
        toast: `Claude がスロット${changedSlot}を更新しました`,
        flash: { slot: changedSlot, at: Date.now(), message: "Claude の更新" },
      });
      setTimeout(() => {
        const st = get();
        if (st.flash && st.flash.slot === changedSlot) set({ flash: null });
      }, FLASH_DURATION_MS);
    } else if (event.entityType === "party" && event.op === "create") {
      await get().refreshList();
      set({ toast: "Claude が新しいパーティを作成しました" });
    } else if (event.entityType === "party" && event.op === "delete") {
      await get().refreshList();
    }
  },

  setToast(msg) {
    set({ toast: msg });
  },
}));
