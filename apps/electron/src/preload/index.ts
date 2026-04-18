import { contextBridge, ipcRenderer } from "electron";
import {
  IPC,
  type GetPokemonDetailsRequest,
  type GetPokemonDetailsResponse,
  type SearchPokemonRequest,
  type SearchPokemonResponse,
} from "@edv4h/poke-mate-shared-types";

const api = {
  searchPokemon: (req: SearchPokemonRequest): Promise<SearchPokemonResponse> =>
    ipcRenderer.invoke(IPC.SEARCH_POKEMON, req),
  getPokemonDetails: (req: GetPokemonDetailsRequest): Promise<GetPokemonDetailsResponse> =>
    ipcRenderer.invoke(IPC.GET_POKEMON_DETAILS, req),
};

contextBridge.exposeInMainWorld("pokeMate", api);

export type PokeMateApi = typeof api;
