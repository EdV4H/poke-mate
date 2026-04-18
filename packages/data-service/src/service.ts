import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { and, eq, gt, like, or } from "drizzle-orm";
import { loadPokemonMaster } from "@edv4h/poke-mate-master-data";
import type {
  ChangeEvent,
  PokemonMaster,
  SearchPokemonRequest,
} from "@edv4h/poke-mate-shared-types";
import { ChangeBus } from "./change-bus.js";
import { changeEvents, masterPokemon, workspaces } from "./schema.js";
import { createPartyService, type PartyService } from "./services/party.js";

export interface DataServiceOptions {
  dbPath: string;
}

export interface DataService {
  readonly bus: ChangeBus;
  readonly party: PartyService;
  searchPokemon(req: SearchPokemonRequest): PokemonMaster[];
  listPokemonMasters(options?: { championsOnly?: boolean; limit?: number }): PokemonMaster[];
  getPokemonDetails(speciesId: string): PokemonMaster | null;
  listChangeEventsSince(sinceId: number): ChangeEvent[];
  close(): void;
}

const MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS master_pokemon (
  id TEXT PRIMARY KEY,
  dex_no INTEGER NOT NULL,
  name_ja TEXT NOT NULL,
  name_en TEXT NOT NULL,
  types_json TEXT NOT NULL,
  base_stats_json TEXT NOT NULL,
  abilities_json TEXT NOT NULL,
  champions_available INTEGER NOT NULL DEFAULT 1,
  mega_forms_json TEXT
);

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS parties (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  name TEXT NOT NULL,
  format TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS pokemon_sets (
  id TEXT PRIMARY KEY,
  party_id TEXT NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  slot INTEGER NOT NULL,
  species_id TEXT NOT NULL,
  forme_id TEXT,
  nature_id TEXT,
  ability_id TEXT,
  item_id TEXT,
  sp_json TEXT NOT NULL DEFAULT '{}',
  moves_json TEXT NOT NULL DEFAULT '[]',
  is_mega_target INTEGER NOT NULL DEFAULT 0,
  origin TEXT NOT NULL DEFAULT 'gui',
  origin_meta_json TEXT,
  version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS change_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  op TEXT NOT NULL,
  actor TEXT NOT NULL,
  ts TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_parties_workspace ON parties(workspace_id);
CREATE INDEX IF NOT EXISTS idx_pokemon_sets_party ON pokemon_sets(party_id);
CREATE INDEX IF NOT EXISTS idx_master_pokemon_name_ja ON master_pokemon(name_ja);
CREATE INDEX IF NOT EXISTS idx_master_pokemon_name_en ON master_pokemon(name_en);
`;

export const DEFAULT_WORKSPACE_ID = "default";

interface Migration {
  version: number;
  up: (sqlite: Database.Database) => void;
}

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    up: (sqlite) => {
      sqlite.exec(MIGRATION_SQL);
    },
  },
  {
    version: 2,
    up: (sqlite) => {
      // pokemon_sets.origin の既存 'home' 行を 'gui' にバックフィル。
      // Phase 0 時点の default 'home' が残っている場合のみ影響する。
      sqlite.exec(`UPDATE pokemon_sets SET origin = 'gui' WHERE origin = 'home';`);
    },
  },
  {
    version: 3,
    up: (sqlite) => {
      // (party_id, slot) の UNIQUE INDEX を v1 済みの既存 DB にも適用する。
      // 既存行に重複があれば slot の重複を検知してエラー化する（手動対応が必要）。
      sqlite.exec(
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_pokemon_sets_party_slot ON pokemon_sets(party_id, slot);`,
      );
    },
  },
  {
    version: 4,
    up: () => {
      // Marker: seedMasterPokemon was switched from onConflictDoNothing to
      // onConflictDoUpdate so that allowlist updates flow into existing DBs.
      // No DDL change is required — the upsert semantics take effect on the
      // next seedMasterPokemon() call after applyMigrations.
    },
  },
];

function applyMigrations(sqlite: Database.Database): void {
  sqlite.exec(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       version INTEGER PRIMARY KEY,
       applied_at TEXT NOT NULL
     );`,
  );
  // BEGIN IMMEDIATE で書き込みロックを取得してから version チェック/適用まで
  // 1 トランザクションで行うことで、並行起動したプロセスとのレース条件を防ぐ。
  // 二重 INSERT に対しては OR IGNORE で idempotent に倒す。
  const checkApplied = sqlite.prepare(
    "SELECT 1 FROM schema_migrations WHERE version = ?",
  );
  const record = sqlite.prepare(
    "INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (?, ?)",
  );
  for (const m of MIGRATIONS) {
    const tx = sqlite.transaction(() => {
      if (checkApplied.get(m.version)) return;
      m.up(sqlite);
      record.run(m.version, new Date().toISOString());
    });
    tx.immediate();
  }
}

function seedDefaultWorkspace(db: BetterSQLite3Database): void {
  const ts = new Date().toISOString();
  db.insert(workspaces)
    .values({
      id: DEFAULT_WORKSPACE_ID,
      name: "Default",
      createdAt: ts,
      updatedAt: ts,
    })
    .onConflictDoNothing()
    .run();
}

function seedMasterPokemon(db: BetterSQLite3Database, sqlite: Database.Database): void {
  const rows = loadPokemonMaster();
  const insertMany = sqlite.transaction((items: PokemonMaster[]) => {
    for (const p of items) {
      const values = {
        id: p.id,
        dexNo: p.dexNo,
        nameJa: p.nameJa,
        nameEn: p.nameEn,
        typesJson: JSON.stringify(p.types),
        baseStatsJson: JSON.stringify(p.baseStats),
        abilitiesJson: JSON.stringify(p.abilities),
        championsAvailable: p.championsAvailable,
        megaFormsJson: p.megaFormsJson ? JSON.stringify(p.megaFormsJson) : null,
      };
      // Upsert: allowlist 更新が既存 DB の master_pokemon に流し込まれるよう、
      // id をキーに全フィールドを上書きする。旧実装 (onConflictDoNothing) では
      // pokemon.json を増やしても既存 DB には反映されなかった。
      db.insert(masterPokemon)
        .values(values)
        .onConflictDoUpdate({
          target: masterPokemon.id,
          set: {
            dexNo: values.dexNo,
            nameJa: values.nameJa,
            nameEn: values.nameEn,
            typesJson: values.typesJson,
            baseStatsJson: values.baseStatsJson,
            abilitiesJson: values.abilitiesJson,
            championsAvailable: values.championsAvailable,
            megaFormsJson: values.megaFormsJson,
          },
        })
        .run();
    }
  });
  insertMany(rows);
}

function rowToPokemonMaster(row: typeof masterPokemon.$inferSelect): PokemonMaster {
  return {
    id: row.id,
    dexNo: row.dexNo,
    nameJa: row.nameJa,
    nameEn: row.nameEn,
    types: JSON.parse(row.typesJson),
    baseStats: JSON.parse(row.baseStatsJson),
    abilities: JSON.parse(row.abilitiesJson),
    championsAvailable: row.championsAvailable,
    megaFormsJson: row.megaFormsJson ? JSON.parse(row.megaFormsJson) : undefined,
  };
}

export function createDataService(options: DataServiceOptions): DataService {
  const sqlite = new Database(options.dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.pragma("foreign_keys = ON");

  const db = drizzle(sqlite);
  applyMigrations(sqlite);
  seedDefaultWorkspace(db);
  seedMasterPokemon(db, sqlite);

  const bus = new ChangeBus();
  const party = createPartyService({
    db,
    sqlite,
    bus,
    defaultWorkspaceId: DEFAULT_WORKSPACE_ID,
  });

  return {
    bus,
    party,

    searchPokemon(req) {
      const trimmed = req.query.trim();
      if (trimmed === "") return [];
      const limit = Math.min(Math.max(req.limit ?? 50, 1), 200);
      const q = `%${trimmed.toLowerCase()}%`;
      const nameMatch = or(
        like(masterPokemon.nameJa, q),
        like(masterPokemon.nameEn, q),
        like(masterPokemon.id, q),
      );
      const where = req.championsOnly
        ? and(eq(masterPokemon.championsAvailable, true), nameMatch)
        : nameMatch;
      const rows = db.select().from(masterPokemon).where(where).limit(limit).all();
      return rows.map(rowToPokemonMaster);
    },

    listPokemonMasters(options) {
      const limit = Math.min(Math.max(options?.limit ?? 500, 1), 2000);
      const where = options?.championsOnly ? eq(masterPokemon.championsAvailable, true) : undefined;
      const query = db.select().from(masterPokemon);
      const rows = (where ? query.where(where) : query).limit(limit).all();
      return rows.map(rowToPokemonMaster);
    },

    getPokemonDetails(speciesId) {
      const row = db.select().from(masterPokemon).where(eq(masterPokemon.id, speciesId)).get();
      return row ? rowToPokemonMaster(row) : null;
    },

    listChangeEventsSince(sinceId) {
      const rows = db
        .select()
        .from(changeEvents)
        .where(gt(changeEvents.id, sinceId))
        .orderBy(changeEvents.id)
        .all();
      return rows.map((r) => ({
        id: r.id,
        entityType: r.entityType,
        entityId: r.entityId,
        op: r.op,
        actor: r.actor,
        ts: r.ts,
      }));
    },

    close() {
      sqlite.close();
    },
  };
}
