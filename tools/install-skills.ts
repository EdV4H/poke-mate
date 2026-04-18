#!/usr/bin/env node
/**
 * Install poke-mate Claude Skills by symlinking `skills/*` into
 * `~/.claude/skills/poke-mate/*`.
 *
 * Usage:
 *   tsx tools/install-skills.ts          # install (symlink)
 *   tsx tools/install-skills.ts --dry    # show plan only
 *   tsx tools/install-skills.ts --undo   # remove symlinks
 */
import { existsSync, lstatSync, mkdirSync, readdirSync, readlinkSync, rmSync, symlinkSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const sourceRoot = join(repoRoot, "skills");
const targetRoot = join(homedir(), ".claude", "skills", "poke-mate");

type Mode = "install" | "dry" | "undo";

function parseMode(argv: string[]): Mode {
  if (argv.includes("--undo")) return "undo";
  if (argv.includes("--dry")) return "dry";
  return "install";
}

function listSkills(): string[] {
  if (!existsSync(sourceRoot)) return [];
  return readdirSync(sourceRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
}

function existingSymlinkTarget(path: string): string | null {
  try {
    const st = lstatSync(path);
    if (st.isSymbolicLink()) return readlinkSync(path);
  } catch {
    return null;
  }
  return null;
}

function main(): void {
  const mode = parseMode(process.argv.slice(2));
  const skills = listSkills();

  if (skills.length === 0) {
    console.error(`No skills found at ${sourceRoot}`);
    process.exit(1);
  }

  console.log(`poke-mate skills installer (mode=${mode})`);
  console.log(`  source: ${sourceRoot}`);
  console.log(`  target: ${targetRoot}`);
  console.log("");

  if (mode === "install" || mode === "dry") {
    if (!existsSync(targetRoot)) {
      console.log(`+ mkdir ${targetRoot}`);
      if (mode === "install") mkdirSync(targetRoot, { recursive: true });
    }
  }

  for (const name of skills) {
    const src = join(sourceRoot, name);
    const dst = join(targetRoot, name);

    if (mode === "undo") {
      const linkTarget = existingSymlinkTarget(dst);
      if (linkTarget === src) {
        console.log(`- unlink ${dst}`);
        rmSync(dst);
      } else if (linkTarget) {
        console.log(`  skip ${dst} (symlink to other target: ${linkTarget})`);
      } else if (existsSync(dst)) {
        console.log(`  skip ${dst} (not a symlink)`);
      }
      continue;
    }

    const current = existingSymlinkTarget(dst);
    if (current === src) {
      console.log(`  ok    ${name} already linked`);
      continue;
    }
    if (existsSync(dst)) {
      console.log(`  WARN  ${dst} exists and is not our symlink — skipping`);
      continue;
    }
    console.log(`+ link  ${dst} -> ${src}`);
    if (mode === "install") symlinkSync(src, dst, "dir");
  }

  console.log("");
  console.log(mode === "dry" ? "Dry-run complete. Re-run without --dry to apply." : "Done.");
}

main();
