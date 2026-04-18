import type Database from "better-sqlite3";
import { and, eq, inArray } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { nanoid } from "nanoid";
import type {
  Actor,
  Party,
  PartyCreateInput,
  PartyPatch,
  PokemonSet,
  PokemonSetInput,
  StatPoints,
} from "@edv4h/poke-mate-shared-types";
import type { ChangeBus } from "../change-bus.js";
import {
  changeEvents,
  parties,
  pokemonSets,
  type PartyRow,
  type PokemonSetRow,
} from "../schema.js";

export class VersionConflictError extends Error {
  constructor(
    public readonly entityType: "party" | "pokemon_set",
    public readonly entityId: string,
    public readonly expectedVersion: number,
  ) {
    super(
      `Version conflict on ${entityType}:${entityId} (expected ${expectedVersion})`,
    );
    this.name = "VersionConflictError";
  }
}

export class NotFoundError extends Error {
  constructor(
    public readonly entityType: "party" | "pokemon_set",
    public readonly entityId: string,
  ) {
    super(`Not found: ${entityType}:${entityId}`);
    this.name = "NotFoundError";
  }
}

export interface PartyServiceDeps {
  db: BetterSQLite3Database;
  sqlite: Database.Database;
  bus: ChangeBus;
  defaultWorkspaceId: string;
}

export interface PartyMutationResult<T> {
  value: T;
  changeEventId: number;
}

export interface PartyService {
  createParty(input: PartyCreateInput, actor: Actor): PartyMutationResult<Party>;
  getParty(partyId: string): Party | null;
  listParties(workspaceId?: string): Party[];
  updateParty(
    partyId: string,
    patch: PartyPatch,
    expectedVersion: number,
    actor: Actor,
  ): PartyMutationResult<Party>;
  deleteParty(partyId: string, actor: Actor): PartyMutationResult<{ id: string }>;
  upsertPartySlot(
    partyId: string,
    slot: number,
    input: PokemonSetInput,
    actor: Actor,
    expectedVersion?: number,
  ): PartyMutationResult<PokemonSet>;
  deletePartySlot(
    partyId: string,
    slot: number,
    actor: Actor,
  ): PartyMutationResult<{ partyId: string; slot: number }>;
}

function rowToParty(row: PartyRow, sets: PokemonSet[]): Party {
  const notes = row.notes ?? undefined;
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    format: row.format,
    ...(notes !== undefined && { notes }),
    sets,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    version: row.version,
  };
}

function rowToSet(row: PokemonSetRow): PokemonSet {
  const spJson = JSON.parse(row.spJson) as StatPoints;
  const movesJson = JSON.parse(row.movesJson) as string[];
  const originMeta = row.originMetaJson ? JSON.parse(row.originMetaJson) : undefined;
  return {
    id: row.id,
    partyId: row.partyId,
    slot: row.slot,
    speciesId: row.speciesId,
    ...(row.formeId !== null && { formeId: row.formeId }),
    ...(row.natureId !== null && { natureId: row.natureId }),
    ...(row.abilityId !== null && { abilityId: row.abilityId }),
    ...(row.itemId !== null && { itemId: row.itemId }),
    spJson,
    movesJson,
    isMegaTarget: row.isMegaTarget,
    origin: row.origin,
    ...(originMeta !== undefined && { originMetaJson: originMeta }),
    version: row.version,
  };
}

function nowIso(): string {
  return new Date().toISOString();
}

function insertChangeEvent(
  db: BetterSQLite3Database,
  entityType: string,
  entityId: string,
  op: "create" | "update" | "delete",
  actor: Actor,
  ts: string,
): number {
  const inserted = db
    .insert(changeEvents)
    .values({ entityType, entityId, op, actor, ts })
    .returning({ id: changeEvents.id })
    .get();
  if (!inserted) {
    throw new Error("Failed to insert change event");
  }
  return inserted.id;
}

export function createPartyService(deps: PartyServiceDeps): PartyService {
  const { db, sqlite, bus, defaultWorkspaceId } = deps;

  function loadParty(partyId: string): Party | null {
    const partyRow = db.select().from(parties).where(eq(parties.id, partyId)).get();
    if (!partyRow) return null;
    const setRows = db
      .select()
      .from(pokemonSets)
      .where(eq(pokemonSets.partyId, partyId))
      .orderBy(pokemonSets.slot)
      .all();
    return rowToParty(partyRow, setRows.map(rowToSet));
  }

  return {
    createParty(input, actor) {
      const workspaceId = input.workspaceId ?? defaultWorkspaceId;
      const id = nanoid();
      const ts = nowIso();

      const tx = sqlite.transaction(() => {
        db.insert(parties)
          .values({
            id,
            workspaceId,
            name: input.name,
            format: input.format,
            notes: input.notes ?? null,
            createdAt: ts,
            updatedAt: ts,
            version: 1,
          })
          .run();
        const eventId = insertChangeEvent(db, "party", id, "create", actor, ts);
        return eventId;
      });
      const changeEventId = tx();

      const party = loadParty(id);
      if (!party) throw new Error("Party disappeared after create");
      bus.emitChange({
        id: changeEventId,
        entityType: "party",
        entityId: id,
        op: "create",
        actor,
        ts,
      });
      return { value: party, changeEventId };
    },

    getParty(partyId) {
      return loadParty(partyId);
    },

    listParties(workspaceId) {
      const partyRows = workspaceId
        ? db.select().from(parties).where(eq(parties.workspaceId, workspaceId)).all()
        : db.select().from(parties).all();
      if (partyRows.length === 0) return [];

      const partyIds = partyRows.map((r) => r.id);
      const setRows = db
        .select()
        .from(pokemonSets)
        .where(inArray(pokemonSets.partyId, partyIds))
        .orderBy(pokemonSets.slot)
        .all();

      const setsByParty = new Map<string, PokemonSet[]>();
      for (const row of setRows) {
        const list = setsByParty.get(row.partyId) ?? [];
        list.push(rowToSet(row));
        setsByParty.set(row.partyId, list);
      }
      return partyRows.map((row) => rowToParty(row, setsByParty.get(row.id) ?? []));
    },

    updateParty(partyId, patch, expectedVersion, actor) {
      const ts = nowIso();
      const tx = sqlite.transaction(() => {
        const existing = db.select().from(parties).where(eq(parties.id, partyId)).get();
        if (!existing) throw new NotFoundError("party", partyId);

        const stmt = sqlite.prepare(
          `UPDATE parties SET name = COALESCE(?, name),
                              format = COALESCE(?, format),
                              notes = CASE WHEN ? = 1 THEN ? ELSE notes END,
                              updated_at = ?,
                              version = version + 1
           WHERE id = ? AND version = ?`,
        );
        const notesProvided = patch.notes !== undefined ? 1 : 0;
        const result = stmt.run(
          patch.name ?? null,
          patch.format ?? null,
          notesProvided,
          patch.notes ?? null,
          ts,
          partyId,
          expectedVersion,
        );
        if (result.changes === 0) {
          throw new VersionConflictError("party", partyId, expectedVersion);
        }
        const eventId = insertChangeEvent(db, "party", partyId, "update", actor, ts);
        return eventId;
      });
      const changeEventId = tx();
      const party = loadParty(partyId);
      if (!party) throw new Error("Party disappeared after update");
      bus.emitChange({
        id: changeEventId,
        entityType: "party",
        entityId: partyId,
        op: "update",
        actor,
        ts,
      });
      return { value: party, changeEventId };
    },

    deleteParty(partyId, actor) {
      const ts = nowIso();
      const tx = sqlite.transaction(() => {
        const result = db.delete(parties).where(eq(parties.id, partyId)).run();
        if (result.changes === 0) {
          throw new NotFoundError("party", partyId);
        }
        const eventId = insertChangeEvent(db, "party", partyId, "delete", actor, ts);
        return eventId;
      });
      const changeEventId = tx();
      bus.emitChange({
        id: changeEventId,
        entityType: "party",
        entityId: partyId,
        op: "delete",
        actor,
        ts,
      });
      return { value: { id: partyId }, changeEventId };
    },

    upsertPartySlot(partyId, slot, input, actor, expectedVersion) {
      if (slot < 1 || slot > 6) {
        throw new Error(`slot must be between 1 and 6, got ${slot}`);
      }
      const ts = nowIso();
      const tx = sqlite.transaction(() => {
        const partyRow = db.select().from(parties).where(eq(parties.id, partyId)).get();
        if (!partyRow) throw new NotFoundError("party", partyId);

        const existing = db
          .select()
          .from(pokemonSets)
          .where(and(eq(pokemonSets.partyId, partyId), eq(pokemonSets.slot, slot)))
          .get();

        let setId: string;
        let op: "create" | "update";
        if (existing) {
          if (expectedVersion !== undefined && existing.version !== expectedVersion) {
            throw new VersionConflictError("pokemon_set", existing.id, expectedVersion);
          }
          setId = existing.id;
          op = "update";
          db.update(pokemonSets)
            .set({
              speciesId: input.speciesId,
              formeId: input.formeId ?? null,
              natureId: input.natureId ?? null,
              abilityId: input.abilityId ?? null,
              itemId: input.itemId ?? null,
              spJson: JSON.stringify(input.spJson ?? {}),
              movesJson: JSON.stringify(input.movesJson ?? []),
              isMegaTarget: input.isMegaTarget ?? false,
              origin: input.origin ?? (actor === "mcp" ? "mcp" : "gui"),
              originMetaJson: input.originMetaJson
                ? JSON.stringify(input.originMetaJson)
                : null,
              version: existing.version + 1,
            })
            .where(eq(pokemonSets.id, existing.id))
            .run();
        } else {
          setId = nanoid();
          op = "create";
          db.insert(pokemonSets)
            .values({
              id: setId,
              partyId,
              slot,
              speciesId: input.speciesId,
              formeId: input.formeId ?? null,
              natureId: input.natureId ?? null,
              abilityId: input.abilityId ?? null,
              itemId: input.itemId ?? null,
              spJson: JSON.stringify(input.spJson ?? {}),
              movesJson: JSON.stringify(input.movesJson ?? []),
              isMegaTarget: input.isMegaTarget ?? false,
              origin: input.origin ?? (actor === "mcp" ? "mcp" : "gui"),
              originMetaJson: input.originMetaJson
                ? JSON.stringify(input.originMetaJson)
                : null,
              version: 1,
            })
            .run();
        }

        db.update(parties)
          .set({ updatedAt: ts, version: partyRow.version + 1 })
          .where(eq(parties.id, partyId))
          .run();

        const setEventId = insertChangeEvent(db, "pokemon_set", setId, op, actor, ts);
        const partyEventId = insertChangeEvent(db, "party", partyId, "update", actor, ts);
        return { setEventId, partyEventId, setId, op };
      });
      const { setEventId, partyEventId, setId, op } = tx();

      const setRow = db.select().from(pokemonSets).where(eq(pokemonSets.id, setId)).get();
      if (!setRow) throw new Error("Slot row disappeared after upsert");
      const value = rowToSet(setRow);
      bus.emitChange({
        id: setEventId,
        entityType: "pokemon_set",
        entityId: setId,
        op,
        actor,
        ts,
      });
      bus.emitChange({
        id: partyEventId,
        entityType: "party",
        entityId: partyId,
        op: "update",
        actor,
        ts,
      });
      return { value, changeEventId: setEventId };
    },

    deletePartySlot(partyId, slot, actor) {
      const ts = nowIso();
      const tx = sqlite.transaction(() => {
        const partyRow = db.select().from(parties).where(eq(parties.id, partyId)).get();
        if (!partyRow) throw new NotFoundError("party", partyId);
        const existing = db
          .select()
          .from(pokemonSets)
          .where(and(eq(pokemonSets.partyId, partyId), eq(pokemonSets.slot, slot)))
          .get();
        if (!existing) {
          throw new NotFoundError("pokemon_set", `${partyId}:${slot}`);
        }
        db.delete(pokemonSets).where(eq(pokemonSets.id, existing.id)).run();
        db.update(parties)
          .set({ updatedAt: ts, version: partyRow.version + 1 })
          .where(eq(parties.id, partyId))
          .run();
        const setEventId = insertChangeEvent(db, "pokemon_set", existing.id, "delete", actor, ts);
        const partyEventId = insertChangeEvent(db, "party", partyId, "update", actor, ts);
        return { setEventId, partyEventId, setId: existing.id };
      });
      const { setEventId, partyEventId, setId } = tx();
      bus.emitChange({
        id: setEventId,
        entityType: "pokemon_set",
        entityId: setId,
        op: "delete",
        actor,
        ts,
      });
      bus.emitChange({
        id: partyEventId,
        entityType: "party",
        entityId: partyId,
        op: "update",
        actor,
        ts,
      });
      const changeEventId = setEventId;
      return { value: { partyId, slot }, changeEventId };
    },
  };
}
