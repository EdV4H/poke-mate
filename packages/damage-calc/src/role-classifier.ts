import type { PokemonMaster } from "@edv4h/poke-mate-shared-types";

export type Role = "attacker" | "wall" | "fast" | "support";

export interface RoleScores {
  attacker: number;
  wall: number;
  fast: number;
  support: number;
}

export function scoreRoles(master: PokemonMaster): RoleScores {
  const { hp, atk, def, spa, spd, spe } = master.baseStats;
  const bulk = hp + def + spd;
  const offense = Math.max(atk, spa);

  return {
    fast: spe,
    attacker: offense + Math.min(spe, 100) * 0.3,
    wall: bulk - Math.max(0, spe - 70) * 0.2,
    support: Math.min(hp, 100) + Math.min(spd, 120) + Math.min(def, 120),
  };
}

export function classifyRole(master: PokemonMaster): Role {
  const scores = scoreRoles(master);
  const { spe } = master.baseStats;

  if (spe >= 110) return "fast";

  const bulk = scores.wall;
  const offense = Math.max(master.baseStats.atk, master.baseStats.spa);

  if (bulk >= 280 && offense < 100) return "wall";
  if (offense >= 110) return "attacker";
  if (bulk >= 240) return "support";
  return "attacker";
}
