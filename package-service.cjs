const fs = require("node:fs/promises"),
  path = require("node:path"),
  crypto = require("node:crypto");
const { validate, toShip } = require("./core-node.cjs");
const sha = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const { png, safePath } = require("./native/assets.cjs");
const { serializeJson } = require("./native/file-io.cjs");
async function exportPackage(parent, project, preview) {
  // Freeze the exact incoming revision before any filesystem await.
  const p = JSON.parse(serializeJson(project)),
    checks = validate(p);
  if (checks.errors.length) throw Error(checks.errors.join("\n"));
  if (JSON.stringify(p).length > 50_000_000)
    throw Error("Project is too large.");
  const hull = toShip(p),
    id = hull.hullId,
    spritePath = safePath(hull.spriteName);
  safePath(id);
  const image = png(p.image),
    previewBytes = png(preview, 12_000_000);
  const files = new Map([
    [`${id}.shipwright.json`, Buffer.from(JSON.stringify(p, null, 2))],
    [`data/hulls/${id}.ship`, Buffer.from(JSON.stringify(hull, null, 2))],
    [spritePath, image],
    ["preview.png", previewBytes],
    [
      "README.txt",
      Buffer.from(
        `Shipwright V1.1.1 design package\n\nOpen ${id}.shipwright.json to continue editing.\nUse preview.png for visual discussion and manifest.json to identify exact artifacts.\nThe data/ and graphics/ paths are staged for integration into your own mod.\nThis is NOT a complete playable mod: ship_data.csv entries, variants, dependencies, mod_info and balance remain separate.\nNo files were written to the active game. Shield radius changes geometry only; shield type remains a gameplay stat.\nEmpty bounds deliberately use the hull collision radius. Nonempty bounds must be a simple closed polygon.\nSprite artwork is user/local reference material; this package grants no redistribution rights.\n`,
      ),
    ],
  ]);
  const manifest = {
    format: "kayn-shipwright-design",
    formatVersion: 1,
    toolVersion: "1.1.1",
    createdUTC: new Date().toISOString(),
    hullId: id,
    gameVerified: false,
    dependencies:
      "Not resolved: integrate with the owning mod and its ship stats/variants.",
    validation: checks,
    spritePixels: {
      width: image.readUInt32BE(16),
      height: image.readUInt32BE(20),
    },
    hullUnits: { width: hull.width, height: hull.height },
    files: [...files].map(([name, bytes]) => ({
      path: name,
      bytes: bytes.length,
      sha256: sha(bytes),
    })),
  };
  if (
    manifest.spritePixels.width !== hull.width ||
    manifest.spritePixels.height !== hull.height
  )
    manifest.validation.warnings.push(
      "Sprite pixels differ from hull units; intentional scaling must be verified in game.",
    );
  files.set("manifest.json", Buffer.from(JSON.stringify(manifest, null, 2)));
  const base = await fs.realpath(parent),
    stage = await fs.mkdtemp(path.join(base, `.${id}-staging-`));
  let final;
  try {
    for (const [name, bytes] of files) {
      safePath(name);
      const target = path.join(stage, ...name.split("/"));
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, bytes, { flag: "wx" });
      const read = await fs.readFile(target);
      if (sha(read) !== sha(bytes)) throw Error(`Readback mismatch: ${name}`);
    }
    final = path.join(
      base,
      `${id}-design-V1.1.1-${path.basename(stage).split("-").pop()}`,
    );
    await fs.rename(stage, final);
    return final;
  } catch (error) {
    await fs.rm(stage, { recursive: true, force: true });
    throw error;
  }
}
module.exports = { exportPackage, safePath, png };
