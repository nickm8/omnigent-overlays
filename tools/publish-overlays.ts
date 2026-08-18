// overlay's version changes whenever its bytes do — so `sha256` mismatches and

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { validateManifest } from "../src/overlays/validate";
import { overlayManifestFromEntries, serializeManifest, versionRegressions } from "./overlay-manifest";
import { overlayArtifactPaths } from "./source-snapshot";
import { entries } from "./userscript-entries";
import type { OverlayManifest } from "../src/overlays/types";

const repoRoot = resolve(process.cwd());
const registryDir = resolve(process.env["OMNIGENT_OVERLAY_REGISTRY_DIR"] ?? repoRoot);
const push = process.argv.includes("--push");

function run(command: string, args: string[], cwd = repoRoot): string {
  return execFileSync(command, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function fail(reason: string): never {
  console.error(`publish aborted: ${reason}`);
  process.exit(1);
}

async function readPublishedManifest(): Promise<OverlayManifest | undefined> {
  try {
    const text = await readFile(resolve(registryDir, "manifest.json"), "utf8");
    const validation = validateManifest(JSON.parse(text));
    return validation.ok ? validation.value : undefined;
  } catch {
    return undefined;
  }
}

async function main(): Promise<void> {
  const dirty = run("git", ["status", "--porcelain"]).trim();
  if (dirty) fail("source working tree is dirty; commit or stash before publishing");
  const sourceRevision = run("git", ["rev-parse", "HEAD"]).trim();

  console.log("running check suite (typecheck, build, staleness, install verify)…");
  for (const script of ["typecheck", "build", "build:check", "verify:install"]) {
    try {
      run("npm", ["run", script]);
    } catch (error) {
      fail(`\`npm run ${script}\` failed:\n${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const artifactPaths = overlayArtifactPaths(repoRoot);
  const shaById = new Map<string, string>();
  const bytesById = new Map<string, Buffer>();
  for (const [id, path] of artifactPaths) {
    const bytes = await readFile(path);
    bytesById.set(id, bytes);
    shaById.set(id, createHash("sha256").update(bytes).digest("hex"));
  }
  const manifest = overlayManifestFromEntries(entries, {
    generatedAt: new Date().toISOString(),
    sourceRevision,
    sha256For: (entry) => (entry.overlay ? (shaById.get(entry.overlay.id) ?? "") : ""),
  });

  const validation = validateManifest(manifest);
  if (!validation.ok) fail(`generated manifest is invalid:\n  ${validation.errors.join("\n  ")}`);

  const published = await readPublishedManifest();
  const offenders = versionRegressions(published, manifest);
  if (offenders.length > 0) {
    fail(
      "bump the version for changed overlays before publishing:\n  " +
        offenders.map((offender) => `${offender.id} (bytes changed but version still ${offender.version})`).join("\n  "),
    );
  }

  const overlaysDir = resolve(registryDir, "overlays");
  await rm(overlaysDir, { recursive: true, force: true });
  await mkdir(overlaysDir, { recursive: true });
  for (const overlay of manifest.overlays) {
    const bytes = bytesById.get(overlay.id);
    if (!bytes) fail(`no built artifact for ${overlay.id}`);
    await writeFile(resolve(registryDir, overlay.entry), bytes);
  }
  await writeFile(resolve(registryDir, "manifest.json"), serializeManifest(manifest));

  run("git", ["add", "manifest.json", "overlays"], registryDir);
  const staged = run("git", ["status", "--porcelain"], registryDir).trim();
  if (!staged) {
    console.log("registry already up to date; nothing to publish.");
    return;
  }
  const subject = `Publish overlays @ ${sourceRevision.slice(0, 8)} (${manifest.overlays.length})`;
  run("git", ["commit", "-m", subject], registryDir);
  console.log(`committed: ${subject}`);

  if (push) {
    const branch = process.env["OMNIGENT_OVERLAY_BRANCH"] ?? "main";
    run("git", ["push", "origin", `HEAD:${branch}`], registryDir);
    console.log(`pushed to origin/${branch}`);
  } else {
    console.log("local commit only — re-run with --push to publish to the shared registry.");
  }

  const listed = await readdir(overlaysDir);
  console.log(`registry now holds ${listed.length} artifact(s): ${listed.sort().join(", ")}`);
}

await main();
