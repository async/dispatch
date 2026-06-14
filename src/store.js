import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export const DEFAULT_HOME = path.join(os.homedir(), ".async", "dispatch");

export function resolveHome(env = process.env) {
  return env.ASYNC_DISPATCH_HOME || DEFAULT_HOME;
}

export function storePaths(home) {
  return {
    home,
    registry: path.join(home, "registry.json"),
    goals: path.join(home, "goals"),
    plans: path.join(home, "plans"),
    boards: path.join(home, "boards"),
    ledgers: path.join(home, "ledgers")
  };
}

export async function ensureStore(home) {
  const paths = storePaths(home);
  await fs.mkdir(paths.goals, { recursive: true });
  await fs.mkdir(paths.plans, { recursive: true });
  await fs.mkdir(paths.boards, { recursive: true });
  await fs.mkdir(paths.ledgers, { recursive: true });
  try {
    await fs.access(paths.registry);
  } catch {
    await writeJson(paths.registry, {
      version: 1,
      goals: [],
      plans: [],
      boards: [],
      ledgers: [],
      updatedAt: new Date().toISOString()
    });
  }
}

export async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

export async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

export async function appendJsonl(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.appendFile(file, `${JSON.stringify(value)}\n`);
}

export async function readJsonl(file) {
  try {
    const raw = await fs.readFile(file, "utf8");
    return raw
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

export function goalDir(home, goalId) {
  return path.join(storePaths(home).goals, goalId);
}

export function planDir(home, planId) {
  return path.join(storePaths(home).plans, planId);
}

export function boardDir(home, boardId) {
  return path.join(storePaths(home).boards, boardId);
}

export function ledgerDir(home, ledgerId) {
  return path.join(storePaths(home).ledgers, ledgerId);
}

export async function readRegistry(home) {
  await ensureStore(home);
  return readJson(storePaths(home).registry);
}

export async function upsertRegistryEntry(home, key, entry) {
  const registry = await readRegistry(home);
  const current = Array.isArray(registry[key]) ? registry[key] : [];
  const next = current.filter((item) => item.id !== entry.id);
  next.push(entry);
  registry[key] = next;
  registry.updatedAt = new Date().toISOString();
  await writeJson(storePaths(home).registry, registry);
  return registry;
}
