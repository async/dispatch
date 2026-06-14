import crypto from "node:crypto";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const metadataFileName = ".async-dispatch-skill.json";
const skillNamePattern = /^[a-z][a-z0-9-]*$/;

export function dispatchPackageRoot() {
  return path.resolve(fileURLToPath(new URL("..", import.meta.url)));
}

export function bundledSkillsDir() {
  const packageRoot = dispatchPackageRoot();
  const sourceSkills = path.join(packageRoot, "skills");
  if (existsSync(sourceSkills)) return sourceSkills;
  return path.join(packageRoot, "dist", "skills");
}

export function defaultCodexSkillsDir() {
  return path.join(os.homedir(), ".codex", "skills");
}

export async function packageInfo({ packageRoot = dispatchPackageRoot() } = {}) {
  const pkg = JSON.parse(await fs.readFile(path.join(packageRoot, "package.json"), "utf8"));
  return {
    name: pkg.name,
    version: pkg.version
  };
}

export async function listBundledSkills({ skillsDir = bundledSkillsDir() } = {}) {
  const entries = await fs.readdir(skillsDir, { withFileTypes: true });
  const skills = [];
  const names = new Set();
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const folderName = entry.name;
    assertValidSkillName(folderName, `Invalid bundled skill folder name: ${folderName}`);
    const skillDir = path.join(skillsDir, folderName);
    const skillPath = path.join(skillDir, "SKILL.md");
    if (!(await pathExists(skillPath))) continue;
    const text = await fs.readFile(skillPath, "utf8");
    const manifest = parseFrontMatter(text);
    if (manifest.name !== folderName) {
      throw new Error(`Bundled skill ${folderName} must declare frontmatter name: ${folderName}`);
    }
    if (names.has(folderName)) {
      throw new Error(`Duplicate bundled skill name: ${folderName}`);
    }
    names.add(folderName);
    skills.push({
      name: folderName,
      description: manifest.description || "",
      sourceDir: skillDir,
      sourceHash: await hashDirectory(skillDir)
    });
  }
  return skills.sort((left, right) => left.name.localeCompare(right.name));
}

export async function validateBundledSkills({ skillsDir = bundledSkillsDir() } = {}) {
  const skills = await listBundledSkills({ skillsDir });
  const failures = [];
  for (const skill of skills) {
    if (!skill.description) {
      failures.push(`${skill.name}: missing description`);
    }
  }
  return { ok: failures.length === 0, skills, failures };
}

export async function getSkillInstallStatus({
  targetDir = defaultCodexSkillsDir(),
  skills,
  skillsDir = bundledSkillsDir()
} = {}) {
  const targetRoot = path.resolve(expandHome(targetDir));
  const bundled = await selectedBundledSkills({ skillsDir, skills });
  const results = [];
  for (const skill of bundled) {
    const destinationDir = skillDestination(targetRoot, skill.name);
    const exists = await pathExists(destinationDir);
    if (!exists) {
      results.push({
        name: skill.name,
        status: "missing",
        destinationDir,
        sourceHash: skill.sourceHash
      });
      continue;
    }
    const metadata = await readInstalledMetadata(destinationDir);
    if (!metadata || metadata.managedBy !== "async-dispatch") {
      results.push({
        name: skill.name,
        status: "unmanaged",
        destinationDir,
        sourceHash: skill.sourceHash
      });
      continue;
    }
    const installedHash = await hashDirectory(destinationDir);
    const metadataMatchesSkill = metadata.skillName === skill.name;
    if (!metadataMatchesSkill) {
      results.push({
        name: skill.name,
        status: "unmanaged",
        reason: "metadata-skill-mismatch",
        destinationDir,
        sourceHash: skill.sourceHash,
        installedHash,
        metadata
      });
      continue;
    }
    let status = "current";
    if (installedHash !== metadata.sourceHash) {
      status = "modified";
    } else if (metadata.sourceHash !== skill.sourceHash) {
      status = "stale";
    }
    results.push({
      name: skill.name,
      status,
      destinationDir,
      sourceHash: skill.sourceHash,
      installedHash,
      metadata
    });
  }
  return { targetDir: targetRoot, results };
}

export async function installBundledSkills({
  targetDir = defaultCodexSkillsDir(),
  skills,
  force = false,
  replaceUnmanaged = false,
  skillsDir = bundledSkillsDir()
} = {}) {
  const targetRoot = path.resolve(expandHome(targetDir));
  const info = await packageInfo();
  const status = await getSkillInstallStatus({ targetDir: targetRoot, skills, skillsDir });
  await fs.mkdir(targetRoot, { recursive: true });
  const bundledByName = new Map((await selectedBundledSkills({ skillsDir, skills })).map((skill) => [skill.name, skill]));
  const results = [];

  for (const current of status.results) {
    const skill = bundledByName.get(current.name);
    if (!skill) continue;
    if (current.status === "current" && !force) {
      results.push({ ...current, action: "skipped", reason: "current" });
      continue;
    }
    if (current.status !== "missing" && !force) {
      results.push({ ...current, action: "skipped", reason: current.status });
      continue;
    }
    if (current.status === "unmanaged" && !replaceUnmanaged) {
      results.push({ ...current, action: "skipped", reason: "unmanaged" });
      continue;
    }

    const installedAt = new Date().toISOString();
    const result = await stageAndSwapSkill({
      targetRoot,
      skill,
      info,
      installedAt,
      destinationDir: current.destinationDir,
      existingStatus: current.status,
      keepBackup: current.status === "modified" || current.status === "unmanaged"
    });
    results.push(result);
  }

  return { targetDir: targetRoot, results };
}

async function selectedBundledSkills({ skillsDir, skills }) {
  const bundled = await listBundledSkills({ skillsDir });
  const selected = normalizeSkillSelection(skills);
  if (!selected) return bundled;
  const knownNames = new Set(bundled.map((skill) => skill.name));
  const unknown = [...selected].filter((name) => !knownNames.has(name));
  if (unknown.length > 0) {
    throw new Error(`Unknown bundled skill: ${unknown.join(", ")}`);
  }
  return bundled.filter((skill) => selected.has(skill.name));
}

async function stageAndSwapSkill({
  targetRoot,
  skill,
  info,
  installedAt,
  destinationDir,
  existingStatus,
  keepBackup
}) {
  const stagingDir = await fs.mkdtemp(path.join(targetRoot, `.async-dispatch-install-${skill.name}-`));
  let backupDir = "";
  try {
    await fs.cp(skill.sourceDir, stagingDir, { recursive: true });
    await fs.writeFile(path.join(stagingDir, metadataFileName), `${JSON.stringify({
      managedBy: "async-dispatch",
      packageName: info.name,
      packageVersion: info.version,
      skillName: skill.name,
      sourceHash: skill.sourceHash,
      installedAt
    }, null, 2)}\n`);
    const stagedHash = await hashDirectory(stagingDir);
    if (stagedHash !== skill.sourceHash) {
      throw new Error(`Staged skill ${skill.name} does not match source hash`);
    }
    if (await pathExists(destinationDir)) {
      backupDir = path.join(targetRoot, `.async-dispatch-backup-${skill.name}-${Date.now()}`);
      await fs.rename(destinationDir, backupDir);
    }
    try {
      await fs.rename(stagingDir, destinationDir);
    } catch (error) {
      if (backupDir) await fs.rename(backupDir, destinationDir);
      throw error;
    }
    if (backupDir && !keepBackup) {
      await fs.rm(backupDir, { recursive: true, force: true });
      backupDir = "";
    }
    return {
      name: skill.name,
      action: existingStatus === "missing" ? "installed" : "replaced",
      previousStatus: existingStatus,
      destinationDir,
      backupDir,
      sourceHash: skill.sourceHash
    };
  } catch (error) {
    await fs.rm(stagingDir, { recursive: true, force: true });
    throw error;
  }
}

function normalizeSkillSelection(skills) {
  if (!skills) return null;
  const values = Array.isArray(skills) ? skills : [skills];
  const selected = values.map((value) => String(value).trim()).filter(Boolean);
  for (const name of selected) {
    assertValidSkillName(name, `Invalid skill name: ${name}`);
  }
  return selected.length > 0 ? new Set(selected) : null;
}

function skillDestination(targetRoot, skillName) {
  const destinationDir = path.resolve(targetRoot, skillName);
  const relative = path.relative(targetRoot, destinationDir);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Skill destination escapes target directory: ${skillName}`);
  }
  return destinationDir;
}

function assertValidSkillName(value, message) {
  if (!skillNamePattern.test(value)) {
    throw new Error(message);
  }
}

function expandHome(value) {
  if (value === "~") return os.homedir();
  if (value.startsWith("~/")) return path.join(os.homedir(), value.slice(2));
  return value;
}

async function readInstalledMetadata(skillDir) {
  try {
    return JSON.parse(await fs.readFile(path.join(skillDir, metadataFileName), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    if (error instanceof SyntaxError) return null;
    throw error;
  }
}

async function hashDirectory(dir) {
  const hash = crypto.createHash("sha256");
  await hashDirectoryInto(hash, dir, "");
  return `sha256:${hash.digest("hex")}`;
}

async function hashDirectoryInto(hash, dir, prefix) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    if (entry.name === metadataFileName) continue;
    const relativePath = path.posix.join(prefix, entry.name);
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      hash.update(`dir:${relativePath}\0`);
      await hashDirectoryInto(hash, fullPath, relativePath);
      continue;
    }
    if (!entry.isFile()) {
      throw new Error(`Unsupported skill file type: ${fullPath}`);
    }
    hash.update(`file:${relativePath}\0`);
    hash.update(await fs.readFile(fullPath));
    hash.update("\0");
  }
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

function parseFrontMatter(text) {
  if (!text.startsWith("---")) return {};
  const end = text.indexOf("\n---", 3);
  if (end === -1) return {};
  const manifest = {};
  for (const line of text.slice(3, end).split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) continue;
    manifest[match[1]] = stripQuotes(match[2]);
  }
  return manifest;
}

function stripQuotes(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}
