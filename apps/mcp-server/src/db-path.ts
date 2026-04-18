import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync } from "node:fs";

function resolveAppDataDir(): string {
  if (process.platform === "darwin") {
    return join(homedir(), "Library", "Application Support");
  }
  if (process.platform === "win32") {
    return process.env["APPDATA"] ?? join(homedir(), "AppData", "Roaming");
  }
  return process.env["XDG_DATA_HOME"] ?? join(homedir(), ".local", "share");
}

export function resolveDbPath(): string {
  const envPath = process.env["POKE_MATE_DB"];
  if (envPath) return envPath;
  const dir = join(resolveAppDataDir(), "poke-mate");
  mkdirSync(dir, { recursive: true });
  return join(dir, "poke-mate.sqlite");
}
