#!/usr/bin/env node
/**
 * Install poke-mate Claude Skills by symlinking `skills/<name>` into
 * `~/.claude/skills/poke-mate-<name>` (flat placement with prefix).
 *
 * Flat placement is required because Claude Code / Desktop only enumerate
 * SKILL.md under ~/.claude/skills/<top-level>/. A nested layout like
 * `~/.claude/skills/poke-mate/build-party-with-me/SKILL.md` is not picked up.
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
const skillsRoot = join(homedir(), ".claude", "skills");
const PREFIX = "poke-mate-";
const LEGACY_NAMESPACE_DIR = join(skillsRoot, "poke-mate");

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

function cleanupLegacyNamespaceDir(mode: Mode): void {
  // Old layout created ~/.claude/skills/poke-mate/<skill>/. Remove any of our
  // symlinks inside it and the directory itself if it becomes empty.
  if (!existsSync(LEGACY_NAMESPACE_DIR)) return;
  const entries = readdirSync(LEGACY_NAMESPACE_DIR);
  for (const entry of entries) {
    const p = join(LEGACY_NAMESPACE_DIR, entry);
    const linkTarget = existingSymlinkTarget(p);
    const expected = join(sourceRoot, entry);
    if (linkTarget === expected) {
      console.log(`- unlink legacy ${p}`);
      if (mode !== "dry") rmSync(p);
    }
  }
  try {
    const remaining = readdirSync(LEGACY_NAMESPACE_DIR);
    if (remaining.length === 0) {
      console.log(`- rmdir legacy ${LEGACY_NAMESPACE_DIR}`);
      if (mode !== "dry") rmSync(LEGACY_NAMESPACE_DIR, { recursive: false });
    }
  } catch {
    // ignore
  }
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
  console.log(`  target: ${skillsRoot}/${PREFIX}<name>`);
  console.log("");

  cleanupLegacyNamespaceDir(mode);

  if (!existsSync(skillsRoot)) {
    console.log(`+ mkdir ${skillsRoot}`);
    if (mode === "install") mkdirSync(skillsRoot, { recursive: true });
  }

  for (const name of skills) {
    const src = join(sourceRoot, name);
    const dst = join(skillsRoot, `${PREFIX}${name}`);

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
      console.log(`  ok    ${PREFIX}${name} already linked`);
      continue;
    }
    if (existsSync(dst)) {
      console.log(`  WARN  ${dst} exists and is not our symlink — skipping`);
      continue;
    }
    console.log(`+ link  ${dst} -> ${src}`);
    if (mode === "install") {
      const symlinkType = process.platform === "win32" ? "junction" : "dir";
      try {
        symlinkSync(src, dst, symlinkType);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`  FAIL  symlink ${dst}: ${msg}`);
        if (process.platform === "win32") {
          console.error(
            `        On Windows, symlinks/junctions may require Developer Mode or admin privileges.`,
          );
          console.error(
            `        Run as Administrator, or copy ${src} to ${dst} manually as a workaround.`,
          );
        }
        throw err;
      }
    }
  }

  console.log("");
  console.log(mode === "dry" ? "Dry-run complete. Re-run without --dry to apply." : "Done.");
}

main();
