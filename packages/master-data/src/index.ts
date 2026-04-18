import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { PokemonMaster } from "@edv4h/poke-mate-shared-types";
import pokemonData from "../data/pokemon.json" with { type: "json" };

export function loadPokemonMaster(): PokemonMaster[] {
  return pokemonData as PokemonMaster[];
}

const __dirname = dirname(fileURLToPath(import.meta.url));
export const POKEMON_DATA_PATH = join(__dirname, "..", "data", "pokemon.json");
