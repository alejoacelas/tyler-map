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
  assert.match(html, /Tyler visited/);
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
  assert.ok(places.filter((place) => place.visitStatus === "confirmed").length > 400);
  assert.equal(places.find((place) => place.id === "country:jp")?.visitStatus, "confirmed");
  assert.equal(places.find((place) => place.id === "country:dk")?.visitStatus, "confirmed");
  assert.equal(run.counts.corpusArticles, 34_345);
  assert.ok(run.counts.placesWithResults > 2_000);
  assert.ok(run.counts.unclassified > 0);
});

test("ships source-valid audited visits with upward-only propagation", async () => {
  const [places, visits, audit, corpus] = await Promise.all([
    readFile(new URL("../public/data/places.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../data/place-visits.jsonl", import.meta.url), "utf8").then((body) => body.trim().split("\n").map(JSON.parse)),
    readFile(new URL("../data/model-runs/place-visit-audit-v3/decisions.jsonl", import.meta.url), "utf8").then((body) => body.trim().split("\n").map(JSON.parse)),
    readFile(new URL("../../2026-07-tyler-cowen-search/corpus/unified/tyler-cowen-posts.jsonl", import.meta.url), "utf8").then((body) => body.trim().split("\n").map(JSON.parse)),
  ]);
  const normalize = (value) => String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const placeById = new Map(places.map((place) => [place.id, place]));
  const visitById = new Map(visits.map((row) => [row.place_id, row]));
  const auditById = new Map(audit.map((row) => [row.place_id, row]));
  const postById = new Map(corpus.map((post) => [post.stable_id, post]));
  assert.equal(visits.length, places.length);
  assert.equal(new Set(visits.map((row) => row.place_id)).size, places.length);
  assert.ok(places.every((place) => place.visitStatus === visitById.get(place.id)?.status && place.visitSource === visitById.get(place.id)?.source));
  assert.ok(visits.filter((row) => row.source === "direct").every((row) => auditById.get(row.place_id)?.decision.verdict === "confirmed_visit"));
  assert.ok(visits.filter((row) => row.status !== "confirmed").every((row) => !row.evidence.some((item) => item.supports === "visit")));
  for (const row of visits.filter((item) => item.status === "confirmed")) {
    assert.ok(row.evidence.length > 0, `${row.place_id} has no visit evidence`);
    for (const evidence of row.evidence) {
      const post = postById.get(evidence.article_id);
      assert.ok(post, `${row.place_id} cites unknown article ${evidence.article_id}`);
      assert.ok(normalize(`${post.title} ${post.text}`).includes(normalize(evidence.quote)), `${row.place_id} has a non-verbatim quote`);
    }
    let parentId = placeById.get(row.place_id)?.parentId;
    while (parentId) {
      assert.equal(visitById.get(parentId)?.status, "confirmed", `${row.place_id} has an unconfirmed ancestor ${parentId}`);
      parentId = placeById.get(parentId)?.parentId;
    }
  }
  assert.ok(visits.some((row) => row.place_id === "country:gb" && row.status === "confirmed" && row.source === "contained-place"));
  assert.ok(visits.some((row) => row.place_id === "country:dk" && row.status === "confirmed" && row.source === "direct"));
});
