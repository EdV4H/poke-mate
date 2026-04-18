import type { PokemonMaster, PokemonType } from "@edv4h/poke-mate-shared-types";
import { ALL_TYPES, analyzeDefensive, getEffectiveness } from "./type-chart.js";
import { classifyRole, type Role } from "./role-classifier.js";

export interface SuggestIntent {
  roles?: Role[];
  coverTypes?: PokemonType[];
  avoidTypes?: PokemonType[];
}

export interface SuggestCandidate {
  speciesId: string;
  nameJa: string;
  nameEn: string;
  role: Role;
  score: number;
  reasons: string[];
}

export interface SuggestInput {
  currentSets: { speciesId: string }[];
  candidates: PokemonMaster[];
  intent: SuggestIntent;
  masterIndex: Map<string, PokemonMaster>;
  limit?: number;
}

export interface PartyCoverage {
  weaknessCounts: Map<PokemonType, number>;
  resistanceCounts: Map<PokemonType, number>;
  roleCounts: Map<Role, number>;
}

export function analyzeParty(
  currentSets: { speciesId: string }[],
  masterIndex: Map<string, PokemonMaster>,
): PartyCoverage {
  const weaknessCounts = new Map<PokemonType, number>();
  const resistanceCounts = new Map<PokemonType, number>();
  const roleCounts = new Map<Role, number>();

  for (const set of currentSets) {
    const master = masterIndex.get(set.speciesId);
    if (!master) continue;
    const breakdown = analyzeDefensive(master.types);
    for (const w of breakdown.weaknesses) {
      weaknessCounts.set(w, (weaknessCounts.get(w) ?? 0) + 1);
    }
    for (const w of breakdown.quadWeaknesses) {
      weaknessCounts.set(w, (weaknessCounts.get(w) ?? 0) + 2);
    }
    for (const r of breakdown.resistances) {
      resistanceCounts.set(r, (resistanceCounts.get(r) ?? 0) + 1);
    }
    for (const r of breakdown.immunities) {
      resistanceCounts.set(r, (resistanceCounts.get(r) ?? 0) + 2);
    }
    const role = classifyRole(master);
    roleCounts.set(role, (roleCounts.get(role) ?? 0) + 1);
  }

  return { weaknessCounts, resistanceCounts, roleCounts };
}

export function suggestPartySlot(input: SuggestInput): SuggestCandidate[] {
  const { currentSets, candidates, intent, masterIndex } = input;
  const limit = input.limit ?? 3;
  const coverage = analyzeParty(currentSets, masterIndex);
  const alreadyIn = new Set(currentSets.map((s) => s.speciesId));

  const problematicWeaknesses: PokemonType[] = [];
  for (const t of ALL_TYPES) {
    const count = coverage.weaknessCounts.get(t) ?? 0;
    const resist = coverage.resistanceCounts.get(t) ?? 0;
    if (count >= 2 && resist === 0) problematicWeaknesses.push(t);
  }

  const desiredRoles = new Set<Role>(intent.roles ?? []);
  if (desiredRoles.size === 0) {
    const present = coverage.roleCounts;
    const allRoles: Role[] = ["attacker", "wall", "fast", "support"];
    for (const r of allRoles) {
      if ((present.get(r) ?? 0) === 0) desiredRoles.add(r);
    }
  }

  const scored: SuggestCandidate[] = [];
  for (const master of candidates) {
    if (alreadyIn.has(master.id)) continue;

    let score = 0;
    const reasons: string[] = [];

    for (const weakType of problematicWeaknesses) {
      const eff = getEffectiveness(weakType, master.types);
      if (eff === 0) {
        score += 30;
        reasons.push(`${weakType} 無効`);
      } else if (eff < 1) {
        score += 15;
        reasons.push(`${weakType} 耐性`);
      }
    }

    for (const covT of intent.coverTypes ?? []) {
      const eff = getEffectiveness(covT, master.types);
      if (eff === 0) {
        score += 20;
        reasons.push(`要望の ${covT} を無効`);
      } else if (eff < 1) {
        score += 10;
        reasons.push(`要望の ${covT} に耐性`);
      }
    }

    for (const avoidT of intent.avoidTypes ?? []) {
      const eff = getEffectiveness(avoidT, master.types);
      if (eff >= 2) {
        score -= 25;
        reasons.push(`${avoidT} に弱い（減点）`);
      }
    }

    const role = classifyRole(master);
    if (desiredRoles.has(role)) {
      score += 15;
      reasons.push(`役割: ${role}`);
    }

    const statsBonus = Math.floor(
      (master.baseStats.hp +
        master.baseStats.atk +
        master.baseStats.def +
        master.baseStats.spa +
        master.baseStats.spd +
        master.baseStats.spe) /
        60,
    );
    score += statsBonus;

    if (score <= 0 && reasons.length === 0) continue;

    scored.push({
      speciesId: master.id,
      nameJa: master.nameJa,
      nameEn: master.nameEn,
      role,
      score,
      reasons,
    });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}
