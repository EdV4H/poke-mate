import { describe, expect, it } from "vitest";
import type { PokemonMaster } from "@edv4h/poke-mate-shared-types";
import { suggestPartySlot } from "./suggest.js";

function mk(id: string, types: PokemonMaster["types"], stats: Partial<PokemonMaster["baseStats"]>): PokemonMaster {
  return {
    id,
    dexNo: 1,
    nameJa: id,
    nameEn: id,
    types,
    baseStats: {
      hp: stats.hp ?? 80,
      atk: stats.atk ?? 80,
      def: stats.def ?? 80,
      spa: stats.spa ?? 80,
      spd: stats.spd ?? 80,
      spe: stats.spe ?? 80,
    },
    abilities: [],
    championsAvailable: true,
  };
}

describe("suggestPartySlot", () => {
  it("prefers fairy types when current party has dragon-heavy weakness", () => {
    const garchomp = mk("garchomp", ["dragon", "ground"], { atk: 130, spe: 102 });
    const dragapult = mk("dragapult", ["dragon", "ghost"], { atk: 120, spe: 142 });
    const clefable = mk("clefable", ["fairy"], { hp: 95, spd: 90 });
    const charizard = mk("charizard", ["fire", "flying"], { spa: 109, spe: 100 });
    const gholdengo = mk("gholdengo", ["steel", "ghost"], { spa: 133 });

    const masterIndex = new Map([
      [garchomp.id, garchomp],
      [dragapult.id, dragapult],
      [clefable.id, clefable],
      [charizard.id, charizard],
      [gholdengo.id, gholdengo],
    ]);

    const results = suggestPartySlot({
      currentSets: [{ speciesId: garchomp.id }, { speciesId: dragapult.id }],
      candidates: [clefable, charizard, gholdengo],
      intent: {},
      masterIndex,
    });

    expect(results.length).toBeGreaterThan(0);
    const top = results[0]!;
    expect(["clefable", "gholdengo"]).toContain(top.speciesId);
  });

  it("excludes already-selected species", () => {
    const garchomp = mk("garchomp", ["dragon", "ground"], {});
    const dragapult = mk("dragapult", ["dragon", "ghost"], {});

    const masterIndex = new Map([
      [garchomp.id, garchomp],
      [dragapult.id, dragapult],
    ]);

    const results = suggestPartySlot({
      currentSets: [{ speciesId: garchomp.id }],
      candidates: [garchomp, dragapult],
      intent: {},
      masterIndex,
    });

    expect(results.find((r) => r.speciesId === garchomp.id)).toBeUndefined();
  });

  it("returns at most limit candidates", () => {
    const mons = Array.from({ length: 10 }, (_, i) => mk(`p${i}`, ["normal"], {}));
    const masterIndex = new Map(mons.map((m) => [m.id, m]));

    const results = suggestPartySlot({
      currentSets: [],
      candidates: mons,
      intent: {},
      masterIndex,
      limit: 3,
    });

    expect(results.length).toBeLessThanOrEqual(3);
  });
});
