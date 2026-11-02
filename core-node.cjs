"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/core.ts
var core_exports = {};
__export(core_exports, {
  History: () => History,
  assertFiniteJson: () => assertFiniteJson,
  categories: () => categories,
  clone: () => clone,
  fromShip: () => fromShip,
  mirror: () => mirror,
  moveSlot: () => moveSlot,
  nextId: () => nextId,
  parseProject: () => parseProject,
  resize: () => resize,
  sizes: () => sizes,
  slotPoints: () => slotPoints,
  toGame: () => toGame,
  toScreen: () => toScreen,
  toShip: () => toShip,
  validate: () => validate
});
module.exports = __toCommonJS(core_exports);

// src/geometry.ts
function outlineErrors(bounds) {
  if (!bounds.length) return [];
  if (bounds.length < 6)
    return ["bounds: use at least three vertices, or an empty outline."];
  const pts = [];
  for (let i = 0; i < bounds.length; i += 2)
    pts.push([bounds[i], bounds[i + 1]]);
  let overflow = false;
  const cross = (a, b, c) => {
    const value = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    if (!Number.isFinite(value)) overflow = true;
    return value;
  };
  const on = (a, b, c) => Math.abs(cross(a, b, c)) < 1e-8 && c[0] >= Math.min(a[0], b[0]) - 1e-8 && c[0] <= Math.max(a[0], b[0]) + 1e-8 && c[1] >= Math.min(a[1], b[1]) - 1e-8 && c[1] <= Math.max(a[1], b[1]) + 1e-8;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6)
      return ["bounds: zero-length edge."];
    const previous = pts[(i + pts.length - 1) % pts.length];
    if (on(previous, a, b) || on(a, b, previous))
      return ["bounds: overlapping adjacent edges."];
    for (let j = i + 1; j < pts.length; j++) {
      if (j === i + 1 || i === 0 && j === pts.length - 1) continue;
      const c = pts[j], d = pts[(j + 1) % pts.length];
      if (cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0 || on(a, b, c) || on(a, b, d) || on(c, d, a) || on(c, d, b))
        return ["bounds: edges intersect or touch."];
    }
  }
  const area = pts.reduce((sum, a, i) => {
    const b = pts[(i + 1) % pts.length];
    return sum + a[0] * b[1] - b[0] * a[1];
  }, 0);
  if (overflow || !Number.isFinite(area))
    return ["bounds: outline arithmetic overflow."];
  return Math.abs(area) < 1e-6 ? ["bounds: outline has no area."] : [];
}

// src/core.ts
var categories = [
  "ENERGY",
  "BALLISTIC",
  "MISSILE",
  "SYNERGY",
  "HYBRID",
  "COMPOSITE",
  "UNIVERSAL",
  "DECORATIVE",
  "BUILT_IN",
  "SYSTEM",
  "LAUNCH_BAY",
  "STATION_MODULE"
];
var sizes = ["SMALL", "MEDIUM", "LARGE"];
var clone = (x) => JSON.parse(JSON.stringify(x));
function fromShip(hull, image) {
  assertFiniteJson(hull);
  const copy = clone(hull);
  const omittedArrays = ["weaponSlots", "engineSlots", "bounds"].filter((key) => copy[key] === void 0);
  for (const key of omittedArrays) copy[key] = [];
  return {
    version: 1,
    image,
    hull: copy,
    ...omittedArrays.length ? { omittedArrays } : {}
  };
}
function toScreen(p, [f, l]) {
  return [p.hull.center[0] - l, p.hull.height - p.hull.center[1] - f];
}
function toGame(p, [x, y]) {
  return [p.hull.height - p.hull.center[1] - y, p.hull.center[0] - x];
}
function nextId(p) {
  let n = 1;
  while (p.hull.weaponSlots.some((s) => s.id === `W${String(n).padStart(3, "0")}`))
    n++;
  return `W${String(n).padStart(3, "0")}`;
}
function mirror(p, s) {
  return {
    ...clone(s),
    id: nextId(p),
    locations: s.locations.map((n, i) => i % 2 ? -n : n),
    angle: -s.angle
  };
}
function slotPoints(locations2) {
  const points = [];
  for (let i = 0; i < locations2.length; i += 2)
    points.push([locations2[i], locations2[i + 1]]);
  return points;
}
function moveSlot(locations2, anchor) {
  const delta = [anchor[0] - locations2[0], anchor[1] - locations2[1]];
  const moved = locations2.map((n, i) => n + delta[i % 2]);
  if (!moved.every(Number.isFinite))
    throw Error("Slot movement exceeds finite coordinate range.");
  return moved;
}
var point = (x) => Array.isArray(x) && x.length === 2 && x.every(Number.isFinite);
var locations = (x) => Array.isArray(x) && x.length >= 2 && x.length <= 8192 && x.length % 2 === 0 && x.every(Number.isFinite);
function assertFiniteJson(value) {
  const pending = [value];
  const seen = /* @__PURE__ */ new WeakSet();
  while (pending.length) {
    const item = pending.pop();
    if (typeof item === "number" && !Number.isFinite(item)) {
      throw Error(
        "JSON contains a nonfinite number; refusing lossy serialization."
      );
    }
    if (item && typeof item === "object" && !seen.has(item)) {
      seen.add(item);
      for (const value2 of Object.values(item)) pending.push(value2);
    }
  }
}
function validate(p) {
  const errors = [], warnings = [];
  try {
    assertFiniteJson(p);
  } catch (error) {
    return { errors: [String(error)], warnings };
  }
  const h = p?.hull;
  if (p?.omittedArrays !== void 0 && (!Array.isArray(p.omittedArrays) || p.omittedArrays.some(
    (key) => !["weaponSlots", "engineSlots", "bounds"].includes(key)
  )))
    errors.push("Invalid omitted-array provenance.");
  if (p?.version !== 1 || !h || typeof h !== "object" || Array.isArray(h))
    return {
      errors: ["Unsupported or missing project version/hull."],
      warnings
    };
  if (typeof p.image !== "string" || !p.image.startsWith("data:image/png;base64,"))
    errors.push("A PNG sprite is required.");
  if (typeof h.hullId !== "string" || !/^[a-zA-Z0-9_-]+$/.test(h.hullId))
    errors.push("Hull ID must use letters, numbers, underscores or dashes.");
  if (!["FRIGATE", "DESTROYER", "CRUISER", "CAPITAL_SHIP", "FIGHTER"].includes(
    h.hullSize
  ))
    errors.push("Invalid hull class.");
  if (![h.width, h.height].every(
    (n) => Number.isFinite(n) && n > 0 && n <= 16384
  ) || !point(h.center))
    errors.push("Invalid hull dimensions or centre.");
  if (typeof h.spriteName !== "string" || !/^graphics\/.+\.png$/i.test(h.spriteName) || h.spriteName.length > 220 || h.spriteName.split("/").some(
    (part) => !part || part === "." || part === ".." || /[<>:"\\|?*]/.test(part) || /[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)
  ))
    errors.push("Sprite path must be a safe relative graphics/*.png path.");
  if (!Array.isArray(h.weaponSlots) || h.weaponSlots.length > 8192)
    return { errors: [...errors, "Missing weapon slots."], warnings };
  const ids = /* @__PURE__ */ new Set();
  for (const s of h.weaponSlots) {
    if (!s || typeof s !== "object") {
      errors.push("Invalid mount.");
      continue;
    }
    if (typeof s.id !== "string" || !s.id || ids.has(s.id))
      errors.push("Mount IDs must be nonempty and unique.");
    ids.add(s.id);
    if (!locations(s.locations) || !Number.isFinite(s.angle) || !Number.isFinite(s.arc) || s.arc < 0 || s.arc > 360)
      errors.push(`${s.id}: invalid coordinates, angle or arc.`);
    if (!categories.includes(s.type) || !sizes.includes(s.size) || !["TURRET", "HARDPOINT", "HIDDEN"].includes(s.mount))
      errors.push(`${s.id}: invalid mount type or size.`);
    if (locations(s.locations) && point(h.center))
      for (const position of slotPoints(s.locations)) {
        const [x, y] = toScreen(p, position);
        if (!Number.isFinite(x) || !Number.isFinite(y))
          errors.push(`${s.id}: screen coordinates overflow.`);
        else if (x < 0 || y < 0 || x > h.width || y > h.height)
          warnings.push(`${s.id} is outside the sprite rectangle.`);
      }
  }
  if (!point(h.shieldCenter) || !Number.isFinite(h.shieldRadius) || h.shieldRadius < 0 || !Number.isFinite(h.collisionRadius) || h.collisionRadius < 0)
    errors.push("Invalid shield or collision geometry.");
  if (!Array.isArray(h.bounds) || h.bounds.length > 8192 || h.bounds.length % 2 !== 0 || !h.bounds.every(Number.isFinite))
    errors.push("bounds: expected finite coordinate pairs.");
  else errors.push(...outlineErrors(h.bounds));
  if (!Array.isArray(h.engineSlots) || h.engineSlots.length > 4096)
    errors.push("engineSlots: expected an array of at most 4096 engines.");
  else
    h.engineSlots.forEach((e, i) => {
      if (!e || typeof e !== "object" || !point(e.location) || ![e.angle, e.width, e.length].every(Number.isFinite) || e.width < 0 || e.length < 0 || e.width === 0 !== (e.length === 0) || e.contrailSize !== void 0 && (!Number.isFinite(e.contrailSize) || e.contrailSize < 0))
        errors.push(
          `engineSlots[${i}]: finite location/angle, positive width/length (or both zero) and nonnegative contrail size required.`
        );
      else if (e.width === 0 && e.length === 0)
        warnings.push(`engineSlots[${i}]: zero-size engine marker preserved.`);
    });
  return { errors, warnings };
}
function toShip(p) {
  const v = validate(p);
  if (v.errors.length) throw Error(v.errors.join("\n"));
  const hull = clone(p.hull);
  for (const key of p.omittedArrays || [])
    if (hull[key].length === 0) Reflect.deleteProperty(hull, key);
  return hull;
}
function parseProject(text) {
  const p = JSON.parse(text);
  const v = validate(p);
  if (v.errors.length) throw Error(v.errors.join("\n"));
  return p;
}
function scaleCandidate(p, f) {
  if (!Number.isFinite(f) || f <= 0) throw Error("Scale must be positive.");
  const h = p.hull;
  h.width *= f;
  h.height *= f;
  h.center = h.center.map((n) => n * f);
  h.shieldCenter = h.shieldCenter.map((n) => n * f);
  h.shieldRadius *= f;
  h.collisionRadius *= f;
  h.bounds = h.bounds.map((n) => n * f);
  for (const s of h.weaponSlots)
    s.locations = s.locations.map((n) => n * f);
  for (const e of h.engineSlots) {
    e.location = e.location.map((n) => n * f);
    for (const k of ["width", "length", "contrailSize"])
      if (typeof e[k] === "number") e[k] *= f;
  }
}
function resize(p, f) {
  const sourceErrors = validate(p).errors;
  if (sourceErrors.length) throw Error(sourceErrors.join("\n"));
  const candidate = clone(p);
  scaleCandidate(candidate, f);
  const errors = validate(candidate).errors;
  if (errors.length) throw Error(errors.join("\n"));
  Object.assign(p, candidate);
}
function historySnapshot(p) {
  return { ...clone({ ...p, image: "" }), image: p.image };
}
var History = class {
  items;
  index = 0;
  constructor(p) {
    this.items = [historySnapshot(p)];
  }
  push(p) {
    this.items = this.items.slice(0, this.index + 1);
    this.items.push(historySnapshot(p));
    if (this.items.length > 80) this.items.shift();
    this.index = this.items.length - 1;
  }
  undo() {
    return this.index > 0 ? historySnapshot(this.items[--this.index]) : null;
  }
  redo() {
    return this.index < this.items.length - 1 ? historySnapshot(this.items[++this.index]) : null;
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  History,
  assertFiniteJson,
  categories,
  clone,
  fromShip,
  mirror,
  moveSlot,
  nextId,
  parseProject,
  resize,
  sizes,
  slotPoints,
  toGame,
  toScreen,
  toShip,
  validate
});
