// Shared filesystem-path and PNG-header contracts for import and export.
function png(data, max = 40_000_000) {
  if (
    typeof data !== "string" ||
    !/^data:image\/png;base64,[A-Za-z0-9+/]*={0,2}$/.test(data) ||
    data.length > max * 1.4
  )
    throw Error("Invalid PNG data.");
  const bytes = Buffer.from(data.split(",")[1], "base64");
  if (
    bytes.length < 24 ||
    !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    throw Error("Invalid PNG header.");
  const width = bytes.readUInt32BE(16),
    height = bytes.readUInt32BE(20);
  if (!width || !height || width > 16384 || height > 16384)
    throw Error("PNG dimensions out of range.");
  return bytes;
}
function safePath(name) {
  if (
    typeof name !== "string" ||
    name.length > 220 ||
    name
      .split("/")
      .some(
        (part) =>
          !part ||
          part === "." ||
          part === ".." ||
          /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part) ||
          /[<>:"\\|?*]/.test(part) ||
          /[. ]$/.test(part),
      )
  )
    throw Error("Unsafe export path.");
  return name;
}

module.exports = { png, safePath };
