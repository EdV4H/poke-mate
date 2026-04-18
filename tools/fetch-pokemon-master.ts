#!/usr/bin/env node
/**
 * Fetch Pokémon master data from PokeAPI based on the Champions allowlist and
 * rewrite packages/master-data/data/pokemon.json.
 *
 * Usage:
 *   tsx tools/fetch-pokemon-master.ts           # generate (uses cache)
 *   tsx tools/fetch-pokemon-master.ts --dry     # preview only (stdout diff summary)
 *   tsx tools/fetch-pokemon-master.ts --refresh # bypass cache and re-download
 *
 * Design:
 * - Allowlist (packages/master-data/data/champions-allowlist.json) is the
 *   source of truth for which species/megas to include.
 * - PokeAPI responses are cached under .cache/pokeapi/ so re-runs are free.
 * - Rate limit: concurrency=4 with a global minimum interval between requests,
 *   giving ~4 requests/second. Enforced by a shared token-bucket in fetchJson
 *   so parallel workers don't exceed the limit.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const ALLOWLIST_PATH = join(repoRoot, "packages", "master-data", "data", "champions-allowlist.json");
const OUTPUT_PATH = join(repoRoot, "packages", "master-data", "data", "pokemon.json");
const CACHE_DIR = join(repoRoot, ".cache", "pokeapi");
const POKEAPI_BASE = "https://pokeapi.co/api/v2";

const POKEMON_TYPES = new Set([
  "normal", "fire", "water", "electric", "grass", "ice",
  "fighting", "poison", "ground", "flying", "psychic", "bug",
  "rock", "ghost", "dragon", "dark", "steel", "fairy",
]);

// ---------- Types ----------

interface AllowlistEntry {
  speciesId: string;   // PokeAPI pokemon slug, e.g. "charizard"
  dexNo: number;
  megas?: string[];    // e.g. ["charizard-mega-x", "charizard-mega-y"]
  aliasId?: string;    // override output id if legacy id differs from slug
  nameJaOverride?: string;
}

interface Allowlist {
  version: number;
  source: string;
  entries: AllowlistEntry[];
}

interface BaseStats {
  hp: number; atk: number; def: number; spa: number; spd: number; spe: number;
}

interface MegaForm {
  id: string;
  nameJa: string;
  nameEn: string;
  types: string[];
  baseStats: BaseStats;
  ability: string;
}

interface PokemonMasterRecord {
  id: string;
  dexNo: number;
  nameJa: string;
  nameEn: string;
  types: string[];
  baseStats: BaseStats;
  abilities: string[];
  championsAvailable: boolean;
  megaFormsJson?: MegaForm[];
}

// ---------- CLI args ----------

type Mode = "apply" | "dry";

function parseArgs(argv: string[]): { mode: Mode; refresh: boolean } {
  return {
    mode: argv.includes("--dry") ? "dry" : "apply",
    refresh: argv.includes("--refresh"),
  };
}

// ---------- Cached fetch ----------

function cachePathFor(pathname: string): string {
  const safe = pathname.replace(/^\/+/, "").replace(/\//g, "_");
  return join(CACHE_DIR, `${safe}.json`);
}

// Shared token-bucket: allow one network hit per MIN_INTERVAL_MS across all
// parallel workers. Cache hits are free and bypass this gate.
const MIN_INTERVAL_MS = 250;
let nextAllowedAt = 0;
async function throttle(): Promise<void> {
  const now = Date.now();
  const wait = nextAllowedAt - now;
  if (wait > 0) await sleep(wait);
  nextAllowedAt = Math.max(now, nextAllowedAt) + MIN_INTERVAL_MS;
}

async function fetchJson(pathname: string, refresh: boolean): Promise<unknown> {
  const cachePath = cachePathFor(pathname);
  if (!refresh && existsSync(cachePath)) {
    return JSON.parse(readFileSync(cachePath, "utf8")) as unknown;
  }
  const url = `${POKEAPI_BASE}${pathname}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    await throttle();
    const res = await fetch(url);
    if (res.status === 429 || res.status >= 500) {
      const backoff = 500 * Math.pow(2, attempt);
      process.stderr.write(`  ${res.status} on ${url}; backing off ${backoff}ms\n`);
      await sleep(backoff);
      continue;
    }
    if (!res.ok) throw new Error(`fetch ${url} failed: ${res.status}`);
    const data = (await res.json()) as unknown;
    mkdirSync(dirname(cachePath), { recursive: true });
    writeFileSync(cachePath, JSON.stringify(data));
    return data;
  }
  throw new Error(`fetch ${url} failed after retries`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------- Concurrency pool ----------

async function pool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, idx: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (true) {
      const idx = cursor++;
      if (idx >= items.length) return;
      const item = items[idx]!;
      results[idx] = await fn(item, idx);
    }
  });
  await Promise.all(workers);
  return results;
}

// ---------- Normalizers ----------

interface PokeApiStat { base_stat: number; stat: { name: string } }
interface PokeApiType { type: { name: string } }
interface PokeApiAbility { ability: { name: string } }
interface PokeApiPokemon {
  name: string;
  types: PokeApiType[];
  stats: PokeApiStat[];
  abilities: PokeApiAbility[];
}
interface PokeApiName { name: string; language: { name: string } }
interface PokeApiVariety { is_default: boolean; pokemon: { name: string } }
interface PokeApiSpecies {
  id: number;
  names: PokeApiName[];
  varieties?: PokeApiVariety[];
}
interface PokeApiForm { form_names?: PokeApiName[]; names?: PokeApiName[] }

function normalizeTypes(p: PokeApiPokemon): string[] {
  const types = p.types.map((t) => t.type.name);
  for (const t of types) {
    if (!POKEMON_TYPES.has(t)) throw new Error(`unknown type ${t} on ${p.name}`);
  }
  return types;
}

function normalizeStats(p: PokeApiPokemon): BaseStats {
  const map: Record<string, keyof BaseStats> = {
    "hp": "hp",
    "attack": "atk",
    "defense": "def",
    "special-attack": "spa",
    "special-defense": "spd",
    "speed": "spe",
  };
  const out: Partial<BaseStats> = {};
  for (const s of p.stats) {
    const key = map[s.stat.name];
    if (!key) continue;
    out[key] = s.base_stat;
  }
  const required: (keyof BaseStats)[] = ["hp", "atk", "def", "spa", "spd", "spe"];
  for (const k of required) {
    if (out[k] === undefined) throw new Error(`missing stat ${k} on ${p.name}`);
  }
  return out as BaseStats;
}

function normalizeAbilities(p: PokeApiPokemon): string[] {
  return p.abilities.map((a) => a.ability.name);
}

function pickJa(names: PokeApiName[] | undefined): string | undefined {
  if (!names) return undefined;
  const hit = names.find((n) => n.language.name === "ja-Hrkt") ??
    names.find((n) => n.language.name === "ja");
  return hit?.name;
}

function pickEn(names: PokeApiName[] | undefined): string | undefined {
  if (!names) return undefined;
  return names.find((n) => n.language.name === "en")?.name;
}

function toTitleCase(slug: string): string {
  // Fallback only — prefer PokeAPI's official English name (language=en) over
  // this slug transform, because slug-based title-casing drops punctuation
  // (e.g. kommo-o → "Kommo O", porygon-z → "Porygon Z").
  return slug.split("-").map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(" ");
}

// ---------- Core ----------

async function fetchBaseRecord(entry: AllowlistEntry, refresh: boolean): Promise<PokemonMasterRecord> {
  const pokemon = (await fetchJson(`/pokemon/${entry.speciesId}`, refresh)) as PokeApiPokemon;
  const species = (await fetchJson(`/pokemon-species/${entry.dexNo}`, refresh)) as PokeApiSpecies;

  // Regional / alternate forms: PokeAPI's /pokemon-form/{slug}.form_names
  // returns only the form suffix ("れいじゅうフォルム"), so we combine it with
  // the species name ("ランドロス") as "<species>(<form>)" for readability.
  // A form is "alternate" when entry.speciesId is not the species' default variety.
  const speciesJa = pickJa(species.names);
  const speciesEn = pickEn(species.names);
  let formSuffixJa: string | undefined;
  let formSuffixEn: string | undefined;
  let formFullJa: string | undefined;
  let formFullEn: string | undefined;
  const defaultVariety = species.varieties?.find((v) => v.is_default)?.pokemon.name;
  const isAltForm = defaultVariety !== undefined && entry.speciesId !== defaultVariety;
  if (isAltForm) {
    try {
      const form = (await fetchJson(`/pokemon-form/${entry.speciesId}`, refresh)) as PokeApiForm;
      formSuffixJa = pickJa(form.form_names);
      formSuffixEn = pickEn(form.form_names);
      // /pokemon-form/.names is the full "アローラライチュウ" style if present.
      formFullJa = pickJa(form.names);
      formFullEn = pickEn(form.names);
    } catch {
      // fall through to species name
    }
  }

  const combinedFormJa = formSuffixJa && speciesJa ? `${speciesJa}(${formSuffixJa})` : undefined;
  const combinedFormEn = formSuffixEn && speciesEn ? `${speciesEn} (${formSuffixEn})` : undefined;
  const nameJa =
    entry.nameJaOverride ?? formFullJa ?? combinedFormJa ?? speciesJa ?? pokemon.name;
  const nameEn =
    formFullEn ?? combinedFormEn ?? speciesEn ?? toTitleCase(pokemon.name);
  const id = entry.aliasId ?? entry.speciesId;

  return {
    id,
    dexNo: entry.dexNo,
    nameJa,
    nameEn,
    types: normalizeTypes(pokemon),
    baseStats: normalizeStats(pokemon),
    abilities: normalizeAbilities(pokemon),
    championsAvailable: true,
  };
}

async function fetchMegaForm(slug: string, refresh: boolean): Promise<MegaForm> {
  const pokemon = (await fetchJson(`/pokemon/${slug}`, refresh)) as PokeApiPokemon;
  let nameJa: string | undefined;
  let nameEn: string | undefined;
  try {
    const form = (await fetchJson(`/pokemon-form/${slug}`, refresh)) as PokeApiForm;
    nameJa = pickJa(form.names) ?? pickJa(form.form_names);
    nameEn = pickEn(form.names) ?? pickEn(form.form_names);
  } catch {
    // some forms lack /pokemon-form; fall back to slug.
  }
  return {
    id: slug,
    nameJa: nameJa ?? toTitleCase(slug),
    nameEn: nameEn ?? toTitleCase(slug),
    types: normalizeTypes(pokemon),
    baseStats: normalizeStats(pokemon),
    ability: pokemon.abilities[0]?.ability.name ?? "unknown",
  };
}

async function buildRecord(entry: AllowlistEntry, refresh: boolean): Promise<PokemonMasterRecord> {
  const base = await fetchBaseRecord(entry, refresh);
  if (entry.megas && entry.megas.length > 0) {
    const megas: MegaForm[] = [];
    for (const slug of entry.megas) {
      try {
        megas.push(await fetchMegaForm(slug, refresh));
      } catch (err) {
        // PokeAPI does not yet know about every Champions-era mega (some only
        // exist on Serebii as planned content). Skip unknown ones and warn,
        // rather than aborting the whole generation.
        const msg = err instanceof Error ? err.message : String(err);
        process.stderr.write(`  WARN  skipping mega ${slug} for ${entry.speciesId}: ${msg}\n`);
      }
    }
    if (megas.length > 0) base.megaFormsJson = megas;
  }
  return base;
}

function sortRecords(records: PokemonMasterRecord[]): PokemonMasterRecord[] {
  return [...records].sort((a, b) => a.dexNo - b.dexNo || a.id.localeCompare(b.id));
}

function readExisting(): PokemonMasterRecord[] {
  if (!existsSync(OUTPUT_PATH)) return [];
  return JSON.parse(readFileSync(OUTPUT_PATH, "utf8")) as PokemonMasterRecord[];
}

function diffSummary(before: PokemonMasterRecord[], after: PokemonMasterRecord[]): string {
  const beforeIds = new Set(before.map((r) => r.id));
  const afterIds = new Set(after.map((r) => r.id));
  const added = [...afterIds].filter((i) => !beforeIds.has(i));
  const removed = [...beforeIds].filter((i) => !afterIds.has(i));
  return `  before: ${before.length} entries\n  after:  ${after.length} entries\n  added:   ${added.length} (${added.slice(0, 5).join(", ")}${added.length > 5 ? ", …" : ""})\n  removed: ${removed.length} (${removed.slice(0, 5).join(", ")}${removed.length > 5 ? ", …" : ""})`;
}

async function main(): Promise<void> {
  const { mode, refresh } = parseArgs(process.argv.slice(2));

  if (!existsSync(ALLOWLIST_PATH)) {
    console.error(`Allowlist not found: ${ALLOWLIST_PATH}`);
    process.exit(1);
  }
  const allowlist = JSON.parse(readFileSync(ALLOWLIST_PATH, "utf8")) as Allowlist;

  console.log(`poke-mate master data fetcher (mode=${mode}, refresh=${refresh})`);
  console.log(`  allowlist: ${ALLOWLIST_PATH} (${allowlist.entries.length} entries)`);
  console.log(`  output:    ${OUTPUT_PATH}`);
  console.log(`  cache:     ${CACHE_DIR}`);
  console.log("");

  const start = Date.now();
  let done = 0;
  const skipped: { entry: AllowlistEntry; reason: string }[] = [];
  const rawRecords = await pool(allowlist.entries, 4, async (entry) => {
    try {
      const rec = await buildRecord(entry, refresh);
      done++;
      if (done % 10 === 0 || done === allowlist.entries.length) {
        process.stdout.write(`  [${done}/${allowlist.entries.length}] ${rec.id}\n`);
      }
      return rec;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`  SKIP  ${entry.speciesId}: ${msg}\n`);
      skipped.push({ entry, reason: msg });
      return null;
    }
  });
  const records = rawRecords.filter((r): r is PokemonMasterRecord => r !== null);
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\nfetched ${records.length} records in ${elapsed}s`);

  const sorted = sortRecords(records);
  const before = readExisting();
  console.log("\ndiff:");
  console.log(diffSummary(before, sorted));

  if (skipped.length > 0) {
    console.log(`\nskipped ${skipped.length} entries (likely slug mismatches — fix allowlist):`);
    for (const s of skipped.slice(0, 20)) {
      console.log(`  - ${s.entry.speciesId}  (${s.reason.split("\n")[0]})`);
    }
  }

  if (mode === "dry") {
    console.log("\n(dry run, not writing)");
    return;
  }

  writeFileSync(OUTPUT_PATH, JSON.stringify(sorted, null, 2) + "\n");
  console.log(`\n+ wrote ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error("fatal:", err);
  process.exit(1);
});
