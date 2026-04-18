import type { StatKey } from "@edv4h/poke-mate-shared-types";

export type NatureStatKey = Exclude<StatKey, "hp">;

export interface Nature {
  id: string;
  nameJa: string;
  up: NatureStatKey | null;
  down: NatureStatKey | null;
}

export const NATURES: Nature[] = [
  { id: "hardy", nameJa: "がんばりや", up: null, down: null },
  { id: "lonely", nameJa: "さみしがり", up: "atk", down: "def" },
  { id: "brave", nameJa: "ゆうかん", up: "atk", down: "spe" },
  { id: "adamant", nameJa: "いじっぱり", up: "atk", down: "spa" },
  { id: "naughty", nameJa: "やんちゃ", up: "atk", down: "spd" },
  { id: "bold", nameJa: "ずぶとい", up: "def", down: "atk" },
  { id: "docile", nameJa: "すなお", up: null, down: null },
  { id: "relaxed", nameJa: "のんき", up: "def", down: "spe" },
  { id: "impish", nameJa: "わんぱく", up: "def", down: "spa" },
  { id: "lax", nameJa: "のうてんき", up: "def", down: "spd" },
  { id: "timid", nameJa: "おくびょう", up: "spe", down: "atk" },
  { id: "hasty", nameJa: "せっかち", up: "spe", down: "def" },
  { id: "serious", nameJa: "まじめ", up: null, down: null },
  { id: "jolly", nameJa: "ようき", up: "spe", down: "spa" },
  { id: "naive", nameJa: "むじゃき", up: "spe", down: "spd" },
  { id: "modest", nameJa: "ひかえめ", up: "spa", down: "atk" },
  { id: "mild", nameJa: "おっとり", up: "spa", down: "def" },
  { id: "quiet", nameJa: "れいせい", up: "spa", down: "spe" },
  { id: "bashful", nameJa: "てれや", up: null, down: null },
  { id: "rash", nameJa: "うっかりや", up: "spa", down: "spd" },
  { id: "calm", nameJa: "おだやか", up: "spd", down: "atk" },
  { id: "gentle", nameJa: "おとなしい", up: "spd", down: "def" },
  { id: "sassy", nameJa: "なまいき", up: "spd", down: "spe" },
  { id: "careful", nameJa: "しんちょう", up: "spd", down: "spa" },
  { id: "quirky", nameJa: "きまぐれ", up: null, down: null },
];

export const STAT_JA_SHORT: Record<NatureStatKey, string> = {
  atk: "攻",
  def: "防",
  spa: "特攻",
  spd: "特防",
  spe: "速",
};

export function formatNature(n: Nature): string {
  if (!n.up || !n.down) return n.nameJa;
  return `${n.nameJa} (+${STAT_JA_SHORT[n.up]}/-${STAT_JA_SHORT[n.down]})`;
}
