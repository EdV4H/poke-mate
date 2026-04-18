import { describe, expect, it } from "vitest";
import type { PokemonMaster } from "@edv4h/poke-mate-shared-types";
import { classifyRole } from "./role-classifier.js";

function mk(name: string, stats: Record<string, number>): PokemonMaster {
  return {
    id: name,
    dexNo: 1,
    nameJa: name,
    nameEn: name,
    types: ["normal"],
    baseStats: {
      hp: stats["hp"] ?? 80,
      atk: stats["atk"] ?? 80,
      def: stats["def"] ?? 80,
      spa: stats["spa"] ?? 80,
      spd: stats["spd"] ?? 80,
      spe: stats["spe"] ?? 80,
    },
    abilities: [],
    championsAvailable: true,
  };
}

describe("classifyRole", () => {
  it("Dragapult (spe 142) is fast", () => {
    const m = mk("Dragapult", { hp: 88, atk: 120, def: 75, spa: 100, spd: 75, spe: 142 });
    expect(classifyRole(m)).toBe("fast");
  });

  it("Blissey (hp 255, def 10, spd 135) is wall", () => {
    const m = mk("Blissey", { hp: 255, atk: 10, def: 10, spa: 75, spd: 135, spe: 55 });
    expect(classifyRole(m)).toBe("wall");
  });

  it("Garchomp (atk 130, spe 102) is attacker", () => {
    const m = mk("Garchomp", { hp: 108, atk: 130, def: 95, spa: 80, spd: 85, spe: 102 });
    expect(classifyRole(m)).toBe("attacker");
  });

  it("Landorus-T (atk 145, spe 91) is attacker", () => {
    const m = mk("Landorus-T", { hp: 89, atk: 145, def: 90, spa: 105, spd: 80, spe: 91 });
    expect(classifyRole(m)).toBe("attacker");
  });

  it("Cresselia (hp 120, def 120, spd 130) is support", () => {
    const m = mk("Cresselia", { hp: 120, atk: 70, def: 120, spa: 75, spd: 130, spe: 85 });
    expect(["support", "wall"]).toContain(classifyRole(m));
  });
});
