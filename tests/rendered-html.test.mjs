import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(new Request(`http://localhost${path}`, { headers: { accept: "text/html" } }), { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });
}

test("server-renders the atlas shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<title>Tyler Cowen Atlas<\/title>/i);
  assert.match(html, /Where are you/);
  assert.match(html, /City, country, or address/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

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
