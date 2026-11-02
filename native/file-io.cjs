const fs = require("node:fs/promises");
const crypto = require("node:crypto");
const { assertFiniteJson } = require("../core-node.cjs");

const hash = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

async function boundedRead(file, maximumBytes) {
  const stat = await fs.stat(file);
  if (!stat.isFile() || stat.size > maximumBytes) {
    throw Error(`File exceeds ${maximumBytes} byte limit: ${file}`);
  }
  const bytes = await fs.readFile(file);
  if (bytes.length > maximumBytes) throw Error("File grew beyond size limit.");
  return bytes;
}

function serializeJson(value) {
  // JSON.stringify already rejects cycles; validate numbers before its normal
  // Infinity/NaN-to-null conversion. Call before creating any staging directory.
  return JSON.stringify(value, (_key, item) => {
    if (typeof item === "number" && !Number.isFinite(item)) {
      throw Error(
        "JSON contains a nonfinite number; refusing lossy serialization.",
      );
    }
    return item;
  });
}

module.exports = { hash, exists, boundedRead, assertFiniteJson, serializeJson };
