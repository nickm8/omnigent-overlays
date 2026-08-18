
import { spawn } from "node:child_process";
import http from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const verbose = process.argv.includes("--verbose");

const checks = [];
function check(label, ok, detail) {
  checks.push({ label, ok, detail });
  process.stdout.write(`  ${ok ? "ok" : "FAIL"}: ${label}${detail && !ok ? ` — ${detail}` : ""}\n`);
}

function log(message) {
  if (verbose) process.stdout.write(`  · ${message}\n`);
}

/** An ephemeral loopback port. Bind to :0, read the port, release it. */
async function freePort() {
  const server = http.createServer();
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  const { port } = server.address();
  await new Promise((done) => server.close(done));
  return port;
}

async function get(url, headers = {}) {
  const response = await fetch(url, { headers, redirect: "manual" });
  return { status: response.status, body: await response.text() };
}

/** Poll until the proxy answers or we give up, so this does not race the spawn. */
async function waitForProxy(base, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = "never responded";
  while (Date.now() < deadline) {
    try {
      await get(`${base}/`);
      return true;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      await new Promise((done) => setTimeout(done, 200));
    }
  }
  process.stderr.write(`  proxy never came up: ${lastError}\n`);
  return false;
}

const workDir = await mkdtemp(join(tmpdir(), "omnigent-overlays-verify-"));
let upstream;
let proxy;

try {
  const upstreamPort = await freePort();
  const proxyPort = await freePort();

  upstream = http.createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end("<!doctype html><html><head><title>stub</title></head><body>ok</body></html>");
  });
  await new Promise((done) => upstream.listen(upstreamPort, "127.0.0.1", done));
  log(`stub upstream on ${upstreamPort}`);

  proxy = spawn(process.execPath, [join(repoRoot, "scripts", "proxy.mjs")], {
    env: {
      ...process.env,
      OMNIGENT_PROXY_HOST: "127.0.0.1",
      OMNIGENT_PROXY_PORT: String(proxyPort),
      OMNIGENT_UPSTREAM_URL: `http://127.0.0.1:${upstreamPort}`,
      OMNIGENT_USERSCRIPTS_ROOT: repoRoot,
      OMNIGENT_OVERLAY_REGISTRY_DIR: repoRoot,
      OMNIGENT_OVERLAY_STATE: join(workDir, "state.json"),
    },
    stdio: verbose ? "inherit" : ["ignore", "pipe", "pipe"],
  });

  let proxyOutput = "";
  if (!verbose) {
    proxy.stdout?.on("data", (chunk) => (proxyOutput += chunk));
    proxy.stderr?.on("data", (chunk) => (proxyOutput += chunk));
  }

  const base = `http://127.0.0.1:${proxyPort}`;
  const up = await waitForProxy(base);
  check("injector starts and answers on loopback", up);
  if (!up) {
    if (proxyOutput) process.stderr.write(`\n--- injector output ---\n${proxyOutput}\n`);
    throw new Error("injector did not start");
  }

  const page = await get(`${base}/`);
  check("proxies the upstream page", page.status === 200 && page.body.includes("stub"), `status ${page.status}`);

  const tags = [...page.body.matchAll(/<script src="(\/_overlays\/[^"]+)"/g)].map((match) => match[1]);
  check("injects overlay <script> tags", tags.length > 0, `found ${tags.length}`);

  check(
    "injects the overlay manager bootstrap",
    page.body.includes("/_overlays/bootstrap.js"),
    "no bootstrap.js tag",
  );

  let fetched = 0;
  for (const path of tags) {
    const asset = await get(`${base}${path}`);
    if (asset.status === 200 && asset.body.length > 0) fetched += 1;
    else log(`asset ${path} -> ${asset.status}`);
  }
  check("every injected overlay artifact resolves", fetched === tags.length, `${fetched}/${tags.length} fetched`);

  const state = await get(`${base}/_overlays/state`);
  check("control API rejects an unauthenticated read", state.status === 401, `status ${state.status}`);

  if (!verbose && checks.some((entry) => !entry.ok) && proxyOutput) {
    process.stderr.write(`\n--- injector output ---\n${proxyOutput}\n`);
  }
} finally {
  if (proxy && proxy.exitCode === null) proxy.kill("SIGTERM");
  if (upstream) await new Promise((done) => upstream.close(done));
  await rm(workDir, { recursive: true, force: true });
}

const failed = checks.filter((entry) => !entry.ok);
if (failed.length > 0) {
  process.stderr.write(`\nINSTALL VERIFY FAILED — ${failed.length}/${checks.length} check(s) failed\n`);
  process.exit(1);
}
process.stdout.write(`\nINSTALL VERIFY PASSED — ${checks.length} checks\n`);
