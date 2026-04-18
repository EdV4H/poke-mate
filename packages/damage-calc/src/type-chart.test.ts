import { describe, expect, it } from "vitest";
import { analyzeDefensive, getEffectiveness } from "./type-chart.js";

describe("getEffectiveness", () => {
  it("fire vs grass is 2x", () => {
    expect(getEffectiveness("fire", ["grass"])).toBe(2);
  });

  it("fire vs water is 0.5x", () => {
    expect(getEffectiveness("fire", ["water"])).toBe(0.5);
  });

  it("electric vs ground is 0 (immune)", () => {
    expect(getEffectiveness("electric", ["ground"])).toBe(0);
  });

  it("ice vs dragon/ground is 4x", () => {
    expect(getEffectiveness("ice", ["dragon", "ground"])).toBe(4);
  });

  it("fairy vs dragon/dark is 4x", () => {
    expect(getEffectiveness("fairy", ["dragon", "dark"])).toBe(4);
  });

  it("fighting vs ghost is 0", () => {
    expect(getEffectiveness("fighting", ["ghost"])).toBe(0);
  });

  it("ground vs flying is 0", () => {
    expect(getEffectiveness("ground", ["flying"])).toBe(0);
  });

  it("water vs fire/ground is 4x", () => {
    expect(getEffectiveness("water", ["fire", "ground"])).toBe(4);
  });

  it("normal vs normal is 1x (neutral)", () => {
    expect(getEffectiveness("normal", ["normal"])).toBe(1);
  });
});

describe("analyzeDefensive", () => {
  it("Charizard (fire/flying) is 4x weak to rock", () => {
    const result = analyzeDefensive(["fire", "flying"]);
    expect(result.quadWeaknesses).toContain("rock");
  });

  it("Garchomp (dragon/ground) is 4x weak to ice", () => {
    const result = analyzeDefensive(["dragon", "ground"]);
    expect(result.quadWeaknesses).toContain("ice");
  });

  it("Gholdengo (steel/ghost) has many resistances and immunities", () => {
    const result = analyzeDefensive(["steel", "ghost"]);
    expect(result.immunities).toContain("normal");
    expect(result.immunities).toContain("fighting");
    expect(result.immunities).toContain("poison");
  });

  it("Dragapult (dragon/ghost) is 0x to normal/fighting", () => {
    const result = analyzeDefensive(["dragon", "ghost"]);
    expect(result.immunities).toContain("normal");
    expect(result.immunities).toContain("fighting");
    expect(result.weaknesses).toContain("fairy");
  });
});
