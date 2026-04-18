import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const masterPokemon = sqliteTable("master_pokemon", {
  id: text("id").primaryKey(),
  dexNo: integer("dex_no").notNull(),
  nameJa: text("name_ja").notNull(),
  nameEn: text("name_en").notNull(),
  typesJson: text("types_json").notNull(),
  baseStatsJson: text("base_stats_json").notNull(),
  abilitiesJson: text("abilities_json").notNull(),
  championsAvailable: integer("champions_available", { mode: "boolean" }).notNull().default(true),
  megaFormsJson: text("mega_forms_json"),
});

export const workspaces = sqliteTable("workspaces", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const parties = sqliteTable("parties", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
  name: text("name").notNull(),
  format: text("format", { enum: ["single", "double"] }).notNull(),
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  version: integer("version").notNull().default(1),
});

export const pokemonSets = sqliteTable("pokemon_sets", {
  id: text("id").primaryKey(),
  partyId: text("party_id").notNull().references(() => parties.id, { onDelete: "cascade" }),
  slot: integer("slot").notNull(),
  speciesId: text("species_id").notNull(),
  formeId: text("forme_id"),
  natureId: text("nature_id"),
  abilityId: text("ability_id"),
  itemId: text("item_id"),
  spJson: text("sp_json").notNull().default("{}"),
  movesJson: text("moves_json").notNull().default("[]"),
  isMegaTarget: integer("is_mega_target", { mode: "boolean" }).notNull().default(false),
  origin: text("origin", { enum: ["home", "scout"] }).notNull().default("home"),
  originMetaJson: text("origin_meta_json"),
  version: integer("version").notNull().default(1),
});

export const changeEvents = sqliteTable("change_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  op: text("op", { enum: ["create", "update", "delete"] }).notNull(),
  actor: text("actor", { enum: ["gui", "mcp"] }).notNull(),
  ts: text("ts").notNull(),
});

export type MasterPokemonRow = typeof masterPokemon.$inferSelect;
export type PartyRow = typeof parties.$inferSelect;
export type PokemonSetRow = typeof pokemonSets.$inferSelect;
export type ChangeEventRow = typeof changeEvents.$inferSelect;
