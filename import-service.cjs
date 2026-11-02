// Stable native import API. Parsing, source resolution and library storage
// have separate owners; this facade preserves existing callers.
const { parseShip } = require("./native/ship-format.cjs");
const { scan, prepare, packagesFor } = require("./native/ship-source.cjs");
const { createLibrary } = require("./native/ship-library.cjs");

module.exports = { parseShip, scan, prepare, packagesFor, createLibrary };
