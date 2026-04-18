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
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const SERVER_NAME = "poke-mate";
const SERVER_ENTRY = join(repoRoot, "apps", "mcp-server", "dist", "index.js");

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

  console.log(`poke-mate MCP registrar (mode=${mode})`);
  console.log(`  config: ${path}`);
  console.log(`  entry:  ${SERVER_ENTRY}`);
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
    command: process.execPath,
    args: [SERVER_ENTRY],
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
}

main();
