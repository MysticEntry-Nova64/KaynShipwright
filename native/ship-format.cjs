const { assertFiniteJson } = require("./file-io.cjs");

// Game files allow comments and trailing commas. Never evaluate their contents.
function parseShip(text) {
  let clean = "",
    quoted = false,
    escape = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i],
      n = text[i + 1];
    if (quoted) {
      clean += c;
      if (escape) escape = false;
      else if (c === "\\") escape = true;
      else if (c === '"') quoted = false;
      continue;
    }
    if (c === '"') {
      quoted = true;
      clean += c;
      continue;
    }
    if (c === "#" || (c === "/" && n === "/")) {
      while (i < text.length && text[i] !== "\n") i++;
      clean += "\n";
      continue;
    }
    if (c === "/" && n === "*") {
      const end = text.indexOf("*/", i + 2);
      if (end < 0) throw Error("Unterminated ship comment.");
      clean += " ";
      i = end + 1;
      continue;
    }
    clean += c;
  }
  let normalized = "";
  quoted = false;
  escape = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (quoted) {
      normalized += c;
      if (escape) escape = false;
      else if (c === "\\") escape = true;
      else if (c === '"') quoted = false;
      continue;
    }
    if (c === '"') quoted = true;
    if (c === ",") {
      let j = i + 1;
      while (/\s/.test(clean[j] || "") && j < clean.length) j++;
      if (clean[j] === "]" || clean[j] === "}") continue;
    }
    normalized += c;
  }
  const value = JSON.parse(normalized.replace(/^\uFEFF/, ""));
  assertFiniteJson(value);
  return value;
}

module.exports = { parseShip };
