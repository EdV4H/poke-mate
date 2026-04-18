import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync } from "node:fs";

export function resolveDbPath(): string {
  const envPath = process.env.POKE_MATE_DB;
  if (envPath) return envPath;
  const dir = join(homedir(), "Library", "Application Support", "poke-mate");
  mkdirSync(dir, { recursive: true });
  return join(dir, "poke-mate.sqlite");
}
