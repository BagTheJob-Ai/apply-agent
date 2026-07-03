#!/usr/bin/env node
import { createRequire } from "node:module";
import { run } from "../lib/cli.js";

// Read the package version at runtime so `--version` always matches package.json
// (which is cut to the skill's Template version) — no second copy to keep in sync.
const require = createRequire(import.meta.url);
const { version } = require("../package.json");

process.exit(await run(process.argv.slice(2), { pkgVersion: version }));
