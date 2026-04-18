import { contextBridge, ipcRenderer } from "electron";
import {
  IPC,
  type ChangeEventPush,
  type ChangeEventsSinceRequest,
  type ChangeEventsSinceResponse,
  type CreatePartyRequest,
  type CreatePartyResponse,
  type DeletePartyRequest,
  type DeletePartyResponse,
  type DeletePartySlotRequest,
  type DeletePartySlotResponse,
  type GetPartyRequest,
  type GetPartyResponse,
  type GetPokemonDetailsRequest,
  type GetPokemonDetailsResponse,
  type ListPartiesRequest,
  type ListPartiesResponse,
  type SearchPokemonRequest,
  type SearchPokemonResponse,
  type UpdatePartyRequest,
  type UpdatePartyResponse,
  type UpsertPartySlotRequest,
  type UpsertPartySlotResponse,
} from "@edv4h/poke-mate-shared-types";

const api = {
  searchPokemon: (req: SearchPokemonRequest): Promise<SearchPokemonResponse> =>
    ipcRenderer.invoke(IPC.SEARCH_POKEMON, req),
  getPokemonDetails: (req: GetPokemonDetailsRequest): Promise<GetPokemonDetailsResponse> =>
    ipcRenderer.invoke(IPC.GET_POKEMON_DETAILS, req),

  listParties: (req: ListPartiesRequest = {}): Promise<ListPartiesResponse> =>
    ipcRenderer.invoke(IPC.LIST_PARTIES, req),
  getParty: (req: GetPartyRequest): Promise<GetPartyResponse> =>
    ipcRenderer.invoke(IPC.GET_PARTY, req),
  createParty: (req: CreatePartyRequest): Promise<CreatePartyResponse> =>
    ipcRenderer.invoke(IPC.CREATE_PARTY, req),
  updateParty: (req: UpdatePartyRequest): Promise<UpdatePartyResponse> =>
    ipcRenderer.invoke(IPC.UPDATE_PARTY, req),
  deleteParty: (req: DeletePartyRequest): Promise<DeletePartyResponse> =>
    ipcRenderer.invoke(IPC.DELETE_PARTY, req),
  upsertPartySlot: (req: UpsertPartySlotRequest): Promise<UpsertPartySlotResponse> =>
    ipcRenderer.invoke(IPC.UPSERT_PARTY_SLOT, req),
  deletePartySlot: (req: DeletePartySlotRequest): Promise<DeletePartySlotResponse> =>
    ipcRenderer.invoke(IPC.DELETE_PARTY_SLOT, req),

  listChangeEventsSince: (req: ChangeEventsSinceRequest): Promise<ChangeEventsSinceResponse> =>
    ipcRenderer.invoke(IPC.CHANGE_EVENTS_SINCE, req),

  onChangeEvent: (listener: (event: ChangeEventPush) => void): (() => void) => {
    const handler = (_e: unknown, event: ChangeEventPush): void => listener(event);
    ipcRenderer.on(IPC.CHANGE_EVENT, handler);
    return () => ipcRenderer.removeListener(IPC.CHANGE_EVENT, handler);
  },
};

contextBridge.exposeInMainWorld("pokeMate", api);

export type PokeMateApi = typeof api;
