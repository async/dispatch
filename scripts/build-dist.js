#!/usr/bin/env node
import { chmod, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const root = new URL("..", import.meta.url);
const dist = new URL("../dist/", import.meta.url);

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

for (const entry of [
  "src/cli.js",
  "src/console-server.js",
  "src/draft-template.js",
  "src/ids.js",
  "src/model.js",
  "src/skills.js",
  "src/store.js"
]) {
  const fileName = entry.split("/").at(-1);
  await cp(new URL(`../${entry}`, import.meta.url), new URL(`../dist/${fileName}`, import.meta.url));
}

for (const entry of ["skills", "templates"]) {
  await cp(new URL(`../${entry}`, import.meta.url), new URL(`../dist/${entry}`, import.meta.url), {
    recursive: true
  });
}

for (const entry of ["api-contract.json", "API_SURFACE.md"]) {
  await cp(new URL(`../${entry}`, import.meta.url), new URL(`../dist/${entry}`, import.meta.url));
}

const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
await writeFile(new URL("../dist/package.json", import.meta.url), `${JSON.stringify({
  name: pkg.name,
  version: pkg.version,
  type: "module"
}, null, 2)}\n`);

await chmod(join(root.pathname, "dist", "cli.js"), 0o755);
