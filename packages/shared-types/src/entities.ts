export type PokemonType =
  | "normal" | "fire" | "water" | "electric" | "grass" | "ice"
  | "fighting" | "poison" | "ground" | "flying" | "psychic" | "bug"
  | "rock" | "ghost" | "dragon" | "dark" | "steel" | "fairy";

export type BattleFormat = "single" | "double";

export type StatKey = "hp" | "atk" | "def" | "spa" | "spd" | "spe";

export type BaseStats = Record<StatKey, number>;
export type StatPoints = Partial<Record<StatKey, number>>;

export interface PokemonMaster {
  id: string;
  dexNo: number;
  nameJa: string;
  nameEn: string;
  types: PokemonType[];
  baseStats: BaseStats;
  abilities: string[];
  championsAvailable: boolean;
  megaFormsJson?: unknown;
}

export interface PokemonSet {
  id: string;
  partyId: string;
  slot: number;
  speciesId: string;
  formeId?: string;
  natureId?: string;
  abilityId?: string;
  itemId?: string;
  spJson: StatPoints;
  movesJson: string[];
  isMegaTarget: boolean;
  origin: "home" | "scout";
  originMetaJson?: unknown;
  version: number;
}

export interface Party {
  id: string;
  workspaceId: string;
  name: string;
  format: BattleFormat;
  notes?: string;
  sets: PokemonSet[];
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface Workspace {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChangeEvent {
  id: number;
  entityType: string;
  entityId: string;
  op: "create" | "update" | "delete";
  actor: "gui" | "mcp";
  ts: string;
}
