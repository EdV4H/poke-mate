#!/usr/bin/env node
/**
 * Register the poke-mate MCP server in Claude Desktop's config.
 *
 * Usage:
 *   tsx tools/register-mcp.ts         # merge into config
 *   tsx tools/register-mcp.ts --dry   # show the would-be config diff
 *   tsx tools/register-mcp.ts --undo  # remove the poke-mate entry
 *
 * Config locations:
 *   macOS:   ~/Library/Application Support/Claude/claude_desktop_config.json
 *   Linux:   $XDG_CONFIG_HOME/Claude/claude_desktop_config.json
 *            or ~/.config/Claude/claude_desktop_config.json
 *   Windows: %APPDATA%/Claude/claude_desktop_config.json
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const SERVER_NAME = "poke-mate";
const SERVER_ENTRY = join(repoRoot, "apps", "mcp-server", "dist", "index.js");
const ELECTRON_PKG_DIR = join(repoRoot, "apps", "electron");

function resolveElectronBinary(): string {
  // apps/electron の node_modules から electron を解決する。
  // electron パッケージは require() すると実行ファイルの絶対パスを返す。
  // Electron ABI でビルドされた better-sqlite3 を MCP でも使うため、
  // Electron バイナリを ELECTRON_RUN_AS_NODE=1 で Node 代わりに使う。
  const requireFromElectron = createRequire(join(ELECTRON_PKG_DIR, "package.json"));
  const exe = requireFromElectron("electron") as string;
  if (typeof exe !== "string" || !existsSync(exe)) {
    throw new Error(
      `Electron binary not found at ${String(exe)}. Run \`pnpm install\` and ensure apps/electron is built.`,
    );
  }
  return exe;
}

type Mode = "apply" | "dry" | "undo";

function parseMode(argv: string[]): Mode {
  if (argv.includes("--undo")) return "undo";
  if (argv.includes("--dry")) return "dry";
  return "apply";
}

function resolveConfigPath(): string {
  if (process.platform === "darwin") {
    return join(homedir(), "Library", "Application Support", "Claude", "claude_desktop_config.json");
  }
  if (process.platform === "win32") {
    const appData = process.env["APPDATA"] ?? join(homedir(), "AppData", "Roaming");
    return join(appData, "Claude", "claude_desktop_config.json");
  }
  const xdg = process.env["XDG_CONFIG_HOME"] ?? join(homedir(), ".config");
  return join(xdg, "Claude", "claude_desktop_config.json");
}

interface ClaudeConfig {
  mcpServers?: Record<string, unknown>;
  [key: string]: unknown;
}

function readConfig(path: string): ClaudeConfig {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf8")) as ClaudeConfig;
  } catch (err) {
    console.error(`Failed to parse ${path}:`, err);
    process.exit(1);
  }
}

function writeConfig(path: string, cfg: ClaudeConfig): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(cfg, null, 2) + "\n", "utf8");
}

function main(): void {
  const mode = parseMode(process.argv.slice(2));
  const path = resolveConfigPath();

  if (!existsSync(SERVER_ENTRY) && mode !== "undo") {
    console.error(`MCP server entry not found: ${SERVER_ENTRY}`);
    console.error(`Build it first: pnpm --filter @edv4h/poke-mate-mcp-server build`);
    process.exit(1);
  }

  const electronBin = mode !== "undo" ? resolveElectronBinary() : "";

  console.log(`poke-mate MCP registrar (mode=${mode})`);
  console.log(`  config:   ${path}`);
  console.log(`  entry:    ${SERVER_ENTRY}`);
  if (mode !== "undo") console.log(`  runtime:  ${electronBin} (ELECTRON_RUN_AS_NODE=1)`);
  console.log("");

  const cfg = readConfig(path);
  const mcpServers = (cfg.mcpServers ?? {}) as Record<string, unknown>;

  if (mode === "undo") {
    if (!(SERVER_NAME in mcpServers)) {
      console.log(`  ${SERVER_NAME} not registered; nothing to do.`);
      return;
    }
    delete mcpServers[SERVER_NAME];
    cfg.mcpServers = mcpServers;
    writeConfig(path, cfg);
    console.log(`- removed ${SERVER_NAME}. Restart Claude Desktop.`);
    return;
  }

  const newEntry = {
    command: electronBin,
    args: [SERVER_ENTRY],
    env: {
      ELECTRON_RUN_AS_NODE: "1",
    },
  };
  mcpServers[SERVER_NAME] = newEntry;
  cfg.mcpServers = mcpServers;

  if (mode === "dry") {
    console.log("Would write:");
    console.log(JSON.stringify(cfg, null, 2));
    return;
  }

  writeConfig(path, cfg);
  console.log(`+ registered ${SERVER_NAME}. Restart Claude Desktop to load.`);
  console.log("");
  console.log("  note: MCP runs via the Electron binary (ELECTRON_RUN_AS_NODE=1)");
  console.log("        so that native modules built for Electron (e.g. better-sqlite3)");
  console.log("        are loadable. If you see NODE_MODULE_VERSION errors, run:");
  console.log("          pnpm rebuild-native");
}

main();
