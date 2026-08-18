
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { validateManifest } from "../src/overlays/validate";
import { overlayManifestFromEntries, serializeManifest } from "./overlay-manifest";
import { entries } from "./userscript-entries";

async function main(): Promise<void> {
  const registryDir = resolve(process.env["OMNIGENT_OVERLAY_REGISTRY_DIR"] ?? process.cwd());
  const sourceRevision = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();

  const shaCache = new Map<string, string>();
  for (const entry of entries) {
    if (!entry.overlay) continue;
    const bytes = await readFile(resolve(process.cwd(), entry.output));
    shaCache.set(entry.overlay.id, createHash("sha256").update(bytes).digest("hex"));
  }

  const manifest = overlayManifestFromEntries(entries, {
    generatedAt: new Date().toISOString(),
    sourceRevision,
    sha256For: (entry) => shaCache.get(entry.overlay?.id ?? "") ?? "",
  });

  const validation = validateManifest(manifest);
  if (!validation.ok) {
    console.error("Generated manifest failed validation:");
    for (const error of validation.errors) console.error(`  - ${error}`);
    process.exitCode = 1;
    return;
  }

  const target = resolve(registryDir, "manifest.json");
  await writeFile(target, serializeManifest(manifest));
  console.log(`wrote ${target} (${manifest.overlays.length} overlays, source ${sourceRevision.slice(0, 8)})`);
  console.log("NOTE: manifest only — `npm run publish:overlays` writes manifest + artifacts as one commit.");
}

await main();
