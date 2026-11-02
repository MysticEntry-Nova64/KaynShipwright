const fs = require("node:fs/promises");
const path = require("node:path");
const { boundedRead } = require("./file-io.cjs");
const { saveFile } = require("../save-service.cjs");

function defaultLocations() {
  const drive = process.env.SystemDrive || "C:";
  return [
    ...new Set([
      path.join(
        process.env["ProgramFiles(x86)"] || drive + "/Program Files (x86)",
        "Fractal Softworks/Starsector",
      ),
      path.join(
        process.env.ProgramFiles || drive + "/Program Files",
        "Fractal Softworks/Starsector",
      ),
      path.join(drive + "/", "Games/Starsector"),
      path.join(drive + "/", "Starsector"),
      "D:/Games/Starsector",
      "E:/Games/Starsector",
    ]),
  ];
}

async function installationRoot(selected) {
  if (typeof selected !== "string" || !path.isAbsolute(selected)) return null;
  try {
    let root = await fs.realpath(selected);
    if (path.basename(root).toLowerCase() === "starsector-core")
      root = path.dirname(root);
    return (
      await fs.stat(path.join(root, "starsector-core/data/hulls"))
    ).isDirectory()
      ? root
      : null;
  } catch (error) {
    if (["ENOENT", "ENOTDIR", "EACCES", "EPERM"].includes(error.code))
      return null;
    throw error;
  }
}

function createLocationStore(directory, candidates = defaultLocations()) {
  let initialized;
  let current;
  async function persist(root, detected) {
    const next = { version: 1, installation: root };
    await fs.mkdir(directory, { recursive: true });
    await saveFile(
      path.join(directory, "starsector-location.json"),
      JSON.stringify(next, null, 2),
    );
    current = { installation: root, detected, needsSelection: !root };
    return current;
  }
  async function initialize() {
    let saved;
    let warning;
    try {
      saved = JSON.parse(
        (
          await boundedRead(
            path.join(directory, "starsector-location.json"),
            64000,
          )
        ).toString("utf8"),
      );
      if (
        saved.version !== 1 ||
        (saved.installation !== null && typeof saved.installation !== "string")
      )
        throw Error("Invalid saved location");
    } catch (error) {
      if (error.code !== "ENOENT")
        warning =
          "The saved Starsector location could not be read. Please select it again.";
    }
    const remembered = await installationRoot(saved?.installation);
    if (remembered)
      return (current = {
        installation: remembered,
        detected: false,
        needsSelection: false,
      });
    for (const candidate of candidates.slice(0, 24)) {
      const root = await installationRoot(candidate);
      if (root) return (current = { ...(await persist(root, true)), warning });
    }
    return (current = {
      installation: null,
      detected: false,
      needsSelection: true,
      warning,
    });
  }
  function get() {
    initialized ||= initialize();
    return initialized.then(() => ({ ...current }));
  }
  async function set(selected) {
    await get();
    const root = await installationRoot(selected);
    if (!root)
      throw Error(
        "Please select the Starsector installation folder containing starsector-core/data/hulls.",
      );
    return persist(root, false);
  }
  async function rememberIfInstallation(selected) {
    if (await installationRoot(selected)) return set(selected);
    return null;
  }
  return { get, set, rememberIfInstallation };
}

module.exports = { defaultLocations, installationRoot, createLocationStore };
