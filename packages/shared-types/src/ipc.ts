import type {
  ChangeEvent,
  ChangeEventReceipt,
  Party,
  PartyCreateInput,
  PartyPatch,
  PokemonMaster,
  PokemonSet,
  PokemonSetInput,
} from "./entities.js";

export const IPC = {
  SEARCH_POKEMON: "pokemon:search",
  GET_POKEMON_DETAILS: "pokemon:getDetails",
  LIST_PARTIES: "party:list",
  GET_PARTY: "party:get",
  CREATE_PARTY: "party:create",
  UPDATE_PARTY: "party:update",
  DELETE_PARTY: "party:delete",
  UPSERT_PARTY_SLOT: "party:upsertSlot",
  DELETE_PARTY_SLOT: "party:deleteSlot",
  CHANGE_EVENTS_SINCE: "changeEvents:since",
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

export interface ListPartiesRequest {
  workspaceId?: string;
}
export type ListPartiesResponse = Party[];

export interface GetPartyRequest {
  partyId: string;
}
export type GetPartyResponse = Party | null;

export type CreatePartyRequest = PartyCreateInput;
export type CreatePartyResponse = Party & ChangeEventReceipt;

export interface UpdatePartyRequest {
  partyId: string;
  patch: PartyPatch;
  expectedVersion: number;
}
export type UpdatePartyResponse = Party & ChangeEventReceipt;

export interface DeletePartyRequest {
  partyId: string;
}
export type DeletePartyResponse = ChangeEventReceipt;

export interface UpsertPartySlotRequest {
  partyId: string;
  slot: number;
  set: PokemonSetInput;
  expectedVersion?: number;
}
export type UpsertPartySlotResponse = PokemonSet & ChangeEventReceipt;

export interface DeletePartySlotRequest {
  partyId: string;
  slot: number;
}
export type DeletePartySlotResponse = ChangeEventReceipt;

export interface ChangeEventsSinceRequest {
  sinceId: number;
}
export type ChangeEventsSinceResponse = ChangeEvent[];

export type ChangeEventPush = ChangeEvent;
