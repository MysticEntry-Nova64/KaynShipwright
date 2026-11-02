const fs = require("node:fs/promises");
const path = require("node:path");
const { validate, fromShip } = require("../core-node.cjs");
const { parseShip } = require("./ship-format.cjs");
const { png, safePath } = require("./assets.cjs");
const { exists, boundedRead, hash } = require("./file-io.cjs");
const MAX_HULL = 4_000_000,
  MAX_IMAGE = 40_000_000;

async function contentRoot(file) {
  let dir = path.dirname(await fs.realpath(file));
  for (let i = 0; i < 16; i++) {
    const relative = path.relative(dir, file).split(path.sep).join("/");
    if (relative.startsWith("data/hulls/")) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}
async function packagesFor(selected) {
  const root = await fs.realpath(selected),
    packages = [];
  if (await exists(path.join(root, "starsector-core/data/hulls"))) {
    packages.push(path.join(root, "starsector-core"));
    const mods = path.join(root, "mods");
    if (await exists(mods))
      for (const e of await fs.readdir(mods, { withFileTypes: true }))
        if (
          e.isDirectory() &&
          (await exists(path.join(mods, e.name, "data/hulls")))
        )
          packages.push(path.join(mods, e.name));
  } else if (await exists(path.join(root, "data/hulls"))) packages.push(root);
  else
    throw Error(
      "Choose a Starsector installation or a mod folder containing data/hulls.",
    );
  return packages;
}
async function scan(selected) {
  const roots = await packagesFor(selected),
    entries = [];
  let visited = 0;
  async function walk(dir, root, depth = 0) {
    if (depth > 12) throw Error("Ship folder nesting exceeds 12 levels.");
    for (const e of await fs.readdir(dir, { withFileTypes: true })) {
      if (++visited > 30000)
        throw Error(
          "Folder scan exceeds 30000 items. Choose a smaller mod folder.",
        );
      const file = path.join(dir, e.name);
      if (e.isDirectory()) await walk(file, root, depth + 1);
      else if (e.isFile() && e.name.toLowerCase().endsWith(".ship")) {
        if (entries.length >= 5000)
          throw Error("More than 5000 ships. Choose a smaller mod folder.");
        let h, error;
        try {
          h = parseShip((await boundedRead(file, MAX_HULL)).toString("utf8"));
          if (
            !h ||
            typeof h !== "object" ||
            Array.isArray(h) ||
            typeof h.hullName !== "string" ||
            typeof h.hullId !== "string"
          )
            throw Error(
              "Expected a ship object with text hullName and hullId.",
            );
        } catch (e) {
          error = String(e.message);
        }
        entries.push({
          id: hash(file),
          file,
          roots,
          source:
            path.basename(root) === "starsector-core"
              ? "Starsector"
              : path.basename(root),
          name: h?.hullName || h?.hullId || e.name,
          hullId: typeof h?.hullId === "string" ? h.hullId : "",
          hullSize: typeof h?.hullSize === "string" ? h.hullSize : "",
          error,
        });
      }
    }
  }
  for (const root of roots) await walk(path.join(root, "data/hulls"), root);
  return entries.sort(
    (a, b) => a.name.localeCompare(b.name) || a.source.localeCompare(b.source),
  );
}
async function spriteAt(root, sprite) {
  const target = path.resolve(root, ...sprite.split("/"));
  if (!(await exists(target))) return null;
  const real = await fs.realpath(target),
    base = await fs.realpath(root),
    relative = path.relative(base, real);
  if (
    relative.startsWith(".." + path.sep) ||
    path.isAbsolute(relative) ||
    relative === ".."
  )
    throw Error("Sprite resolves outside the selected content folder.");
  return real;
}
async function inspect(
  file,
  roots = [],
  manualSprite = null,
  verifyImage = () => {},
) {
  const source = await fs.realpath(file),
    bytes = await boundedRead(source, MAX_HULL),
    hull = parseShip(bytes.toString("utf8"));
  if (!hull || typeof hull !== "object" || Array.isArray(hull))
    throw Error("Ship file must contain an object.");
  if (typeof hull.hullName !== "string")
    throw Error("Ship hullName must be text.");
  if (
    typeof hull.spriteName !== "string" ||
    !/^graphics\/.+\.png$/i.test(hull.spriteName)
  )
    throw Error(
      "Expected a relative graphics/*.png spriteName in the ship file.",
    );
  safePath(hull.spriteName);
  const own = await contentRoot(source);
  let sprite = manualSprite;
  if (!sprite && own) sprite = await spriteAt(own, hull.spriteName);
  if (!sprite) {
    const candidates = new Set();
    for (const root of roots) {
      const found = await spriteAt(root, hull.spriteName);
      if (found) candidates.add(found);
    }
    if (candidates.size === 1) sprite = [...candidates][0];
    else {
      const error = Error(
        candidates.size
          ? "Several matching sprites found. Choose the matching PNG."
          : `Sprite not found: ${hull.spriteName}. Choose the matching PNG.`,
      );
      error.code = "SPRITE_REQUIRED";
      throw error;
    }
  }
  const spriteSource = await fs.realpath(sprite),
    imageBytes = await boundedRead(spriteSource, MAX_IMAGE),
    image = "data:image/png;base64," + imageBytes.toString("base64");
  png(image);
  verifyImage(imageBytes);
  const project = fromShip(hull, image);
  return {
    issues: validate(project).errors,
    project,
    source,
    spriteSource,
    sourceHash: hash(bytes),
    spriteHash: hash(imageBytes),
    fingerprint: hash(Buffer.concat([Buffer.from(source), bytes, imageBytes])),
    sourceName: own
      ? path.basename(own) === "starsector-core"
        ? "Starsector"
        : path.basename(own)
      : path.basename(path.dirname(source)),
  };
}

async function prepare(...args) {
  const { issues, ...prepared } = await inspect(...args);
  if (issues.length)
    throw Error("Unsupported or invalid layout: " + issues.join("\n"));
  return prepared;
}
module.exports = { scan, prepare, inspect, packagesFor };
