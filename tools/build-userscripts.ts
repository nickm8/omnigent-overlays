
import { build } from "esbuild";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { NodeBuild, UserscriptEntry } from "./userscript-entries";
import { common, entries, nodeBuilds } from "./userscript-entries";

function metadata(entry: UserscriptEntry): string {
  const rows: Array<[string, string]> = [
    ["name", entry.name],
    ["namespace", common.namespace],
    ["version", entry.version],
    ["description", entry.description],
    ...(entry.match ?? common.match).map((value): [string, string] => ["match", value]),
    ...(entry.excludeMatch ?? common.excludeMatch).map((value): [string, string] => ["exclude-match", value]),
    ["run-at", common.runAt],
    ["grant", common.grant],
  ];
  return [
    "// ==UserScript==",
    ...rows.map(([key, value]) => `// @${key.padEnd(14)}${value}`),
    "// ==/UserScript==",
    "",
  ].join("\n");
}

async function compile(entry: UserscriptEntry): Promise<string> {
  const result = await build({
    entryPoints: [entry.source],
    bundle: true,
    write: false,
    format: "iife",
    target: "es2022",
    legalComments: "none",
    charset: "utf8",
  });
  const body = result.outputFiles[0]?.text;
  if (!body) throw new Error(`esbuild emitted no output for ${entry.source}`);
  return `${metadata(entry)}${body}`;
}

async function compileNode(nodeBuild: NodeBuild): Promise<string> {
  const result = await build({
    entryPoints: [nodeBuild.source],
    bundle: true,
    write: false,
    platform: "node",
    format: "esm",
    target: "node22",
    packages: "external",
    legalComments: "none",
    charset: "utf8",
  });
  const body = result.outputFiles[0]?.text;
  if (!body) throw new Error(`esbuild emitted no output for ${nodeBuild.source}`);
  return `// GENERATED from ${nodeBuild.source} by tools/build-userscripts.ts — edit the source, then npm run build.\n${body}`;
}

const browserBuilds: NodeBuild[] = [
  { source: "src/overlays/panel/bootstrap.ts", output: "assets/overlays-bootstrap.js" },
];

async function compileBrowser(browserBuild: NodeBuild): Promise<string> {
  const result = await build({
    entryPoints: [browserBuild.source],
    bundle: true,
    write: false,
    format: "iife",
    target: "es2022",
    legalComments: "none",
    charset: "utf8",
  });
  const body = result.outputFiles[0]?.text;
  if (!body) throw new Error(`esbuild emitted no output for ${browserBuild.source}`);
  return `// GENERATED from ${browserBuild.source} by tools/build-userscripts.ts — edit the source, then npm run build.\n${body}`;
}

const check = process.argv.includes("--check");
let stale = false;

async function emit(output: string, generated: string): Promise<void> {
  const resolved = resolve(output);
  if (check) {
    const current = await readFile(resolved, "utf8").catch(() => "");
    if (current !== generated) {
      console.error(`stale generated file: ${output}`);
      stale = true;
    }
  } else {
    await mkdir(dirname(resolved), { recursive: true });
    await writeFile(resolved, generated);
    console.log(`built ${output}`);
  }
}

for (const entry of entries) {
  await emit(entry.output, await compile(entry));
}
for (const nodeBuild of nodeBuilds) {
  await emit(nodeBuild.output, await compileNode(nodeBuild));
}
for (const browserBuild of browserBuilds) {
  await emit(browserBuild.output, await compileBrowser(browserBuild));
}
if (stale) process.exitCode = 1;
