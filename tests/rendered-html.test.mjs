import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import net from "node:net";
import test from "node:test";

async function availablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

async function withServer(run) {
  const port = await availablePort();
  const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", String(port)], {
    cwd: new URL("..", import.meta.url),
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  server.stdout.on("data", (chunk) => { output += chunk; });
  server.stderr.on("data", (chunk) => { output += chunk; });
  try {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (server.exitCode !== null) throw new Error(`Next.js exited before serving:\n${output}`);
      try {
        const response = await fetch(`http://127.0.0.1:${port}/`);
        if (response.ok) return await run(response, port);
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Next.js did not start:\n${output}`);
  } finally {
    server.kill("SIGTERM");
  }
}

test("server-renders the atlas shell", async () => withServer(async (response) => {
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<title>Tyler Cowen Atlas<\/title>/i);
  assert.match(html, /Where are you/);
  assert.match(html, /City, country, or address/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
}));

test("ships a reproducible location index", async () => {
  const [places, run] = await Promise.all([
    readFile(new URL("../public/data/places.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../reproduce/run.json", import.meta.url), "utf8").then(JSON.parse),
  ]);
  assert.ok(places.length > 30_000);
  assert.ok(places.some((place) => place.name === "Turkey" && place.resultCount > 0));
  assert.ok(places.some((place) => place.id === "admin1:us.ut" && place.resultCount > 20));
  assert.equal(run.counts.corpusArticles, 34_345);
  assert.ok(run.counts.placesWithResults > 2_000);
  assert.ok(run.counts.unclassified > 0);
});
