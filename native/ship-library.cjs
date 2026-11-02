const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { validate } = require("../core-node.cjs");
const { boundedRead, serializeJson } = require("./file-io.cjs");

const ENTRY_ID = /^ship-[a-f0-9-]{36}$/;
const MAX_ENTRY_BYTES = 60_000_000;
const MAX_SUMMARY_BYTES = 64_000;

function summarize(entry) {
  const { project, ...metadata } = entry;
  const { hullName, hullId, hullSize } = project.hull;
  return { ...metadata, project: { hull: { hullName, hullId, hullSize } } };
}

function checkSummary(entry, expectedId) {
  const hull = entry?.project?.hull;
  if (
    entry?.format !== 1 ||
    entry.id !== expectedId ||
    typeof entry.fingerprint !== "string" ||
    !hull ||
    !["hullName", "hullId", "hullSize"].every(
      (key) => typeof hull[key] === "string",
    )
  ) {
    throw Error("Invalid saved library summary.");
  }
  return entry;
}

function createLibrary(directory) {
  // Keep a Promise<void> tail: retaining the last completed result here would
  // unnecessarily keep its entire embedded sprite alive after the caller exits.
  let queue = Promise.resolve();

  async function get(id) {
    if (typeof id !== "string" || !ENTRY_ID.test(id))
      throw Error("Invalid library entry.");
    const bytes = await boundedRead(
      path.join(directory, id, "entry.json"),
      MAX_ENTRY_BYTES,
    );
    const entry = JSON.parse(bytes.toString("utf8"));
    if (
      entry.id !== id ||
      entry.format !== 1 ||
      validate(entry.project).errors.length
    ) {
      throw Error("Library entry is missing or invalid.");
    }
    // This also catches corrupted unknown-field values rather than coercing them.
    serializeJson(entry);
    return entry;
  }

  async function readSummary(id) {
    const file = path.join(directory, id, "summary.json");
    try {
      const bytes = await boundedRead(file, MAX_SUMMARY_BYTES);
      return checkSummary(JSON.parse(bytes.toString("utf8")), id);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      // Read-only compatibility with 1.1.0 entries. Do not rewrite their originals.
      return summarize(await get(id));
    }
  }

  async function list() {
    await fs.mkdir(directory, { recursive: true });
    const entries = [];
    const warnings = [];
    for (const item of await fs.readdir(directory, { withFileTypes: true })) {
      if (!item.isDirectory() || !ENTRY_ID.test(item.name)) continue;
      try {
        entries.push(await readSummary(item.name));
      } catch (error) {
        warnings.push(`${item.name}: ${error.message}`);
      }
    }
    return { entries, warnings };
  }

  async function publish(prepared) {
    const errors = validate(prepared.project).errors;
    if (errors.length)
      throw Error("Invalid project for library import: " + errors.join("\n"));
    const current = await list();
    const duplicate = current.entries.find(
      (entry) => entry.fingerprint === prepared.fingerprint,
    );
    if (duplicate) return { entry: duplicate, duplicate: true };

    const id = "ship-" + crypto.randomUUID();
    const entry = {
      ...prepared,
      format: 1,
      id,
      createdUTC: new Date().toISOString(),
    };
    const contents = new Map([
      ["entry.json", serializeJson(entry)],
      ["summary.json", serializeJson(summarize(entry))],
    ]);
    const stage = await fs.mkdtemp(path.join(directory, ".pending-"));
    try {
      for (const [name, text] of contents) {
        const file = path.join(stage, name);
        await fs.writeFile(file, text, { flag: "wx" });
        if ((await fs.readFile(file, "utf8")) !== text)
          throw Error("Library readback mismatch.");
      }
      await fs.rename(stage, path.join(directory, id));
    } catch (error) {
      try {
        await fs.rm(stage, { recursive: true, force: true });
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          "Import failed; temporary library data could not be removed.",
          { cause: error },
        );
      }
      throw error;
    }
    return { entry, duplicate: false };
  }

  function add(prepared) {
    const result = queue.then(() => publish(prepared));
    queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  return { list, get, add };
}

module.exports = { createLibrary };
