import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { PokemonMaster } from "@edv4h/poke-mate-shared-types";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");

export function loadPokemonMaster(): PokemonMaster[] {
  const raw = readFileSync(join(DATA_DIR, "pokemon.json"), "utf-8");
  return JSON.parse(raw) as PokemonMaster[];
}

export const POKEMON_DATA_PATH = join(DATA_DIR, "pokemon.json");
