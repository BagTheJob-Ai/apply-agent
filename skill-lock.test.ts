import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { parseSkillVersion } from "./lib/cli.js";

// Release gate + version-immutability ledger.
//
// skill.lock pins the CURRENT skill's Template version to its content hash, so the
// skill can't change without updating the lock. skill-versions.json is the
// append-only ledger of every skill version's hash: the "append-only" CI check
// (test.yml) forbids changing or removing an existing entry, so a given version can
// never map to two different contents. Together they make the invariant real —
// changing the skill forces a NEW version, because you can't rewrite an old one.
//
// This is the guard that used to live in the private repo's Go test (skill_test.go),
// moved here next to the content it protects as the skill consolidates into this
// repo (BagTheJob issue #217). After a real edit: bump **Template version** in
// APPLICATION_AGENT.md, set skill.lock.sha256 to `shasum -a 256 APPLICATION_AGENT.md`,
// and ADD the new version→hash entry to skill-versions.json (never edit an existing one).

const skillPath = new URL("./APPLICATION_AGENT.md", import.meta.url);
const lockPath = new URL("./skill.lock", import.meta.url);
const ledgerPath = new URL("./skill-versions.json", import.meta.url);

const currentSkill = () => {
  const content = readFileSync(skillPath, "utf8");
  return {
    version: parseSkillVersion(content),
    sha256: createHash("sha256").update(content, "utf8").digest("hex"),
  };
};

test("skill.lock version and sha256 match APPLICATION_AGENT.md", () => {
  const s = currentSkill();
  const lock = JSON.parse(readFileSync(lockPath, "utf8"));
  expect(s.version).toMatch(/^v[0-9]+\.[0-9]+\.[0-9]+$/);
  expect(lock.version).toBe(s.version);
  expect(lock.sha256).toBe(s.sha256);
});

test("skill-versions.json records the current skill's version immutably", () => {
  const s = currentSkill();
  const ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
  // The current version must be recorded with exactly this hash. The append-only CI
  // check guarantees this entry can never later be rewritten to a different hash, so
  // the version identifies one content forever (the 426 staleness gate can trust it).
  expect(ledger[s.version]).toBe(s.sha256);
});
