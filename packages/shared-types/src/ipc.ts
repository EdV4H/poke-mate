import type { PokemonMaster } from "./entities.js";

export const IPC = {
  SEARCH_POKEMON: "pokemon:search",
  GET_POKEMON_DETAILS: "pokemon:getDetails",
  CHANGE_EVENT: "change:event",
} as const;

export type IpcChannel = (typeof IPC)[keyof typeof IPC];

export interface SearchPokemonRequest {
  query: string;
  championsOnly?: boolean;
  limit?: number;
}
export type SearchPokemonResponse = PokemonMaster[];

export interface GetPokemonDetailsRequest {
  speciesId: string;
}
export type GetPokemonDetailsResponse = PokemonMaster | null;
