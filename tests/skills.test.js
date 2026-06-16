import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import {
  getSkillInstallStatus,
  installBundledSkills,
  listBundledSkills,
  validateBundledSkills
} from "../src/skills.js";

const execFile = promisify(execFileCallback);
const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const cliPath = path.join(repoRoot, "src", "cli.js");
const bundledSkillNames = [
  "dispatch-code-routing",
  "dispatch-root-runtime",
  "dispatch-skill-evolution",
  "dispatch-start"
];

test("bundled skills are listed and validated for CLI installation", async () => {
  const skills = await listBundledSkills();
  const names = skills.map((skill) => skill.name);
  const validation = await validateBundledSkills();

  assert.deepEqual(names, bundledSkillNames);
  assert.ok(skills.every((skill) => skill.description.includes("Dispatch") || skill.description.includes("async-dispatch")));
  assert.equal(validation.ok, true);
  assert.equal(validation.skills.length, 4);
});

test("bundled skill names must match safe folder basenames", async () => {
  const skillsDir = await fs.mkdtemp(path.join(os.tmpdir(), "dispatch-bad-skills-"));
  try {
    await writeSkill(skillsDir, "bad-skill", "../escape");
    await assert.rejects(
      () => listBundledSkills({ skillsDir }),
      /must declare frontmatter name: bad-skill/
    );
  } finally {
    await fs.rm(skillsDir, { recursive: true, force: true });
  }
});

test("skill installer records metadata, status, and preserves unmanaged folders", async () => {
  const targetDir = await fs.mkdtemp(path.join(os.tmpdir(), "dispatch-skills-"));
  try {
    const initial = await installBundledSkills({ targetDir });
    assert.equal(initial.results.length, 4);
    assert.ok(initial.results.every((result) => result.action === "installed"));

    const current = await getSkillInstallStatus({ targetDir, skills: "dispatch-root-runtime" });
    assert.deepEqual(current.results.map((result) => result.status), ["current"]);

    const skillPath = path.join(targetDir, "dispatch-root-runtime", "SKILL.md");
    await fs.appendFile(skillPath, "\nLOCAL EDIT\n", "utf8");

    const modified = await getSkillInstallStatus({ targetDir, skills: "dispatch-root-runtime" });
    assert.deepEqual(modified.results.map((result) => result.status), ["modified"]);

    const skipped = await installBundledSkills({
      targetDir,
      skills: "dispatch-root-runtime"
    });
    assert.deepEqual(skipped.results.map((result) => result.action), ["skipped"]);
    assert.deepEqual(skipped.results.map((result) => result.reason), ["modified"]);
    assert.match(await fs.readFile(skillPath, "utf8"), /LOCAL EDIT/);

    const forced = await installBundledSkills({
      targetDir,
      skills: ["dispatch-root-runtime"],
      force: true
    });
    assert.deepEqual(forced.results.map((result) => result.action), ["replaced"]);
    assert.ok(forced.results[0].backupDir);
    assert.doesNotMatch(await fs.readFile(skillPath, "utf8"), /LOCAL EDIT/);

    const unmanagedDir = path.join(targetDir, "dispatch-code-routing");
    await fs.rm(unmanagedDir, { recursive: true, force: true });
    await fs.mkdir(unmanagedDir, { recursive: true });
    await fs.writeFile(path.join(unmanagedDir, "SKILL.md"), "local skill\n");
    const refused = await installBundledSkills({
      targetDir,
      skills: "dispatch-code-routing",
      force: true
    });
    assert.deepEqual(refused.results.map((result) => result.action), ["skipped"]);
    assert.deepEqual(refused.results.map((result) => result.reason), ["unmanaged"]);
    assert.equal(await fs.readFile(path.join(unmanagedDir, "SKILL.md"), "utf8"), "local skill\n");

    const replaced = await installBundledSkills({
      targetDir,
      skills: "dispatch-code-routing",
      force: true,
      replaceUnmanaged: true
    });
    assert.deepEqual(replaced.results.map((result) => result.action), ["replaced"]);
    assert.ok(replaced.results[0].backupDir);
    assert.match(await fs.readFile(path.join(unmanagedDir, "SKILL.md"), "utf8"), /name: dispatch-code-routing/);
  } finally {
    await fs.rm(targetDir, { recursive: true, force: true });
  }
});

test("skills CLI supports JSON list, status, install, and unknown skill errors", async () => {
  const targetDir = await fs.mkdtemp(path.join(os.tmpdir(), "dispatch-skills-cli-"));
  try {
    const listed = JSON.parse((await execCli(["skills", "list", "--json"])).stdout);
    assert.deepEqual(listed.skills.map((skill) => skill.name), bundledSkillNames);

    const install = JSON.parse((await execCli([
      "skills",
      "install",
      "--target",
      targetDir,
      "--skill",
      "dispatch-root-runtime",
      "--skill",
      "dispatch-code-routing",
      "--json"
    ])).stdout);
    assert.deepEqual(install.results.map((result) => result.action), ["installed", "installed"]);

    const status = JSON.parse((await execCli([
      "skills",
      "status",
      "--target",
      targetDir,
      "--json"
    ])).stdout);
    assert.deepEqual(status.results.map((result) => result.status), ["current", "current", "missing", "missing"]);

    await assert.rejects(
      () => execCli(["skills", "install", "--target", targetDir, "--skill", "../escape"]),
      /Invalid skill name/
    );
  } finally {
    await fs.rm(targetDir, { recursive: true, force: true });
  }
});

test("packed package exposes the async-dispatch CLI and bundled skills", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "dispatch-pack-"));
  try {
    await execFile(process.execPath, [path.join(repoRoot, "scripts", "build-dist.js")], {
      cwd: repoRoot
    });
    const pack = JSON.parse((await execFile("pnpm", ["pack", "--json", "--pack-destination", tmp], {
      cwd: repoRoot
    })).stdout);
    const installDir = path.join(tmp, "install");
    await fs.mkdir(installDir);
    await execFile("npm", ["install", "--ignore-scripts", "--prefix", installDir, pack.filename]);
    const bin = path.join(installDir, "node_modules", ".bin", "async-dispatch");
    const listed = await execFile(bin, ["skills", "list"]);
    assert.match(listed.stdout, /dispatch-root-runtime/);
    assert.match(listed.stdout, /dispatch-start/);

    const targetDir = path.join(tmp, "codex-skills");
    const installed = await execFile(bin, ["skills", "install", "--target", targetDir, "--skill", "dispatch-root-runtime"]);
    assert.match(installed.stdout, /installed: dispatch-root-runtime/);
    assert.match(await fs.readFile(path.join(targetDir, "dispatch-root-runtime", "SKILL.md"), "utf8"), /name: dispatch-root-runtime/);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

async function execCli(args) {
  return execFile(process.execPath, [cliPath, ...args], { cwd: repoRoot });
}

async function writeSkill(skillsDir, folderName, manifestName) {
  const skillDir = path.join(skillsDir, folderName);
  await fs.mkdir(skillDir, { recursive: true });
  await fs.writeFile(path.join(skillDir, "SKILL.md"), `---\nname: ${manifestName}\ndescription: Bad skill\n---\n# Bad Skill\n`);
}
