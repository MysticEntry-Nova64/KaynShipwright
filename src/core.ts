import { outlineErrors } from "./geometry.ts";
export type Point = [number, number];
export type Locations = [number, number, ...number[]];
export interface Slot {
  id: string;
  locations: Locations;
  type: string;
  size: string;
  mount: string;
  angle: number;
  arc: number;
  [key: string]: unknown;
}
export interface Hull {
  hullId: string;
  hullName: string;
  hullSize: string;
  width: number;
  height: number;
  center: Point;
  spriteName: string;
  weaponSlots: Slot[];
  engineSlots: any[];
  bounds: number[];
  shieldCenter: Point;
  shieldRadius: number;
  collisionRadius: number;
  [key: string]: any;
}
export interface Project {
  version: 1;
  image: string;
  hull: Hull;
  omittedArrays?: ("weaponSlots" | "engineSlots" | "bounds")[];
}
export const categories = [
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
  "STATION_MODULE",
];
export const sizes = ["SMALL", "MEDIUM", "LARGE"];
export const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
export function fromShip(hull: Hull, image: string): Project {
  assertFiniteJson(hull);
  const copy = clone(hull);
  const omittedArrays = (
    ["weaponSlots", "engineSlots", "bounds"] as const
  ).filter((key) => copy[key] === undefined);
  for (const key of omittedArrays) copy[key] = [];
  return {
    version: 1,
    image,
    hull: copy,
    ...(omittedArrays.length ? { omittedArrays } : {}),
  };
}
export function toScreen(p: Project, [f, l]: readonly number[]): Point {
  return [p.hull.center[0] - l, p.hull.height - p.hull.center[1] - f];
}
export function toGame(p: Project, [x, y]: Point): Point {
  return [p.hull.height - p.hull.center[1] - y, p.hull.center[0] - x];
}
export function nextId(p: Project) {
  let n = 1;
  while (
    p.hull.weaponSlots.some((s) => s.id === `W${String(n).padStart(3, "0")}`)
  )
    n++;
  return `W${String(n).padStart(3, "0")}`;
}
export function mirror(p: Project, s: Slot): Slot {
  return {
    ...clone(s),
    id: nextId(p),
    locations: s.locations.map((n, i) => (i % 2 ? -n : n)) as Locations,
    angle: -s.angle,
  };
}
export function slotPoints(locations: Locations): Point[] {
  const points: Point[] = [];
  for (let i = 0; i < locations.length; i += 2)
    points.push([locations[i], locations[i + 1]]);
  return points;
}
export function moveSlot(locations: Locations, anchor: Point): Locations {
  const delta = [anchor[0] - locations[0], anchor[1] - locations[1]];
  const moved = locations.map((n, i) => n + delta[i % 2]) as Locations;
  if (!moved.every(Number.isFinite))
    throw Error("Slot movement exceeds finite coordinate range.");
  return moved;
}
const point = (x: unknown): x is Point =>
  Array.isArray(x) && x.length === 2 && x.every(Number.isFinite);
const locations = (x: unknown): x is Locations =>
  Array.isArray(x) &&
  x.length >= 2 &&
  x.length <= 8192 &&
  x.length % 2 === 0 &&
  x.every(Number.isFinite);
export function assertFiniteJson(value: unknown): void {
  const pending: unknown[] = [value];
  const seen = new WeakSet<object>();
  while (pending.length) {
    const item = pending.pop();
    if (typeof item === "number" && !Number.isFinite(item)) {
      throw Error(
        "JSON contains a nonfinite number; refusing lossy serialization.",
      );
    }
    if (item && typeof item === "object" && !seen.has(item)) {
      seen.add(item);
      for (const value of Object.values(item)) pending.push(value);
    }
  }
}
export function validate(p: any) {
  const errors: string[] = [],
    warnings: string[] = [];
  try {
    assertFiniteJson(p);
  } catch (error) {
    return { errors: [String(error)], warnings };
  }
  const h = p?.hull;
  if (
    p?.omittedArrays !== undefined &&
    (!Array.isArray(p.omittedArrays) ||
      p.omittedArrays.some(
        (key: unknown) =>
          !["weaponSlots", "engineSlots", "bounds"].includes(key as string),
      ))
  )
    errors.push("Invalid omitted-array provenance.");
  if (p?.version !== 1 || !h || typeof h !== "object" || Array.isArray(h))
    return {
      errors: ["Unsupported or missing project version/hull."],
      warnings,
    };
  if (
    typeof p.image !== "string" ||
    !p.image.startsWith("data:image/png;base64,")
  )
    errors.push("A PNG sprite is required.");
  if (typeof h.hullId !== "string" || !/^[a-zA-Z0-9_-]+$/.test(h.hullId))
    errors.push("Hull ID must use letters, numbers, underscores or dashes.");
  if (
    !["FRIGATE", "DESTROYER", "CRUISER", "CAPITAL_SHIP", "FIGHTER"].includes(
      h.hullSize,
    )
  )
    errors.push("Invalid hull class.");
  if (
    ![h.width, h.height].every(
      (n: number) => Number.isFinite(n) && n > 0 && n <= 16384,
    ) ||
    !point(h.center)
  )
    errors.push("Invalid hull dimensions or centre.");
  if (
    typeof h.spriteName !== "string" ||
    !/^graphics\/.+\.png$/i.test(h.spriteName) ||
    h.spriteName.length > 220 ||
    h.spriteName
      .split("/")
      .some(
        (part: string) =>
          !part ||
          part === "." ||
          part === ".." ||
          /[<>:"\\|?*]/.test(part) ||
          /[. ]$/.test(part) ||
          /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part),
      )
  )
    errors.push("Sprite path must be a safe relative graphics/*.png path.");
  if (!Array.isArray(h.weaponSlots) || h.weaponSlots.length > 8192)
    return { errors: [...errors, "Missing weapon slots."], warnings };
  const ids = new Set<string>();
  for (const s of h.weaponSlots) {
    if (!s || typeof s !== "object") {
      errors.push("Invalid mount.");
      continue;
    }
    if (typeof s.id !== "string" || !s.id || ids.has(s.id))
      errors.push("Mount IDs must be nonempty and unique.");
    ids.add(s.id);
    if (
      !locations(s.locations) ||
      !Number.isFinite(s.angle) ||
      !Number.isFinite(s.arc) ||
      s.arc < 0 ||
      s.arc > 360
    )
      errors.push(`${s.id}: invalid coordinates, angle or arc.`);
    if (
      !categories.includes(s.type) ||
      !sizes.includes(s.size) ||
      !["TURRET", "HARDPOINT", "HIDDEN"].includes(s.mount)
    )
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
  if (
    !point(h.shieldCenter) ||
    !Number.isFinite(h.shieldRadius) ||
    h.shieldRadius < 0 ||
    !Number.isFinite(h.collisionRadius) ||
    h.collisionRadius < 0
  )
    errors.push("Invalid shield or collision geometry.");
  if (
    !Array.isArray(h.bounds) ||
    h.bounds.length > 8192 ||
    h.bounds.length % 2 !== 0 ||
    !h.bounds.every(Number.isFinite)
  )
    errors.push("bounds: expected finite coordinate pairs.");
  else errors.push(...outlineErrors(h.bounds));
  if (!Array.isArray(h.engineSlots) || h.engineSlots.length > 4096)
    errors.push("engineSlots: expected an array of at most 4096 engines.");
  else
    h.engineSlots.forEach((e: any, i: number) => {
      if (
        !e ||
        typeof e !== "object" ||
        !point(e.location) ||
        ![e.angle, e.width, e.length].every(Number.isFinite) ||
        e.width < 0 ||
        e.length < 0 ||
        (e.width === 0) !== (e.length === 0) ||
        (e.contrailSize !== undefined &&
          (!Number.isFinite(e.contrailSize) || e.contrailSize < 0))
      )
        errors.push(
          `engineSlots[${i}]: finite location/angle, positive width/length (or both zero) and nonnegative contrail size required.`,
        );
      else if (e.width === 0 && e.length === 0)
        warnings.push(`engineSlots[${i}]: zero-size engine marker preserved.`);
    });
  return { errors, warnings };
}
export function toShip(p: Project): Hull {
  const v = validate(p);
  if (v.errors.length) throw Error(v.errors.join("\n"));
  const hull = clone(p.hull);
  for (const key of p.omittedArrays || [])
    if (hull[key].length === 0) Reflect.deleteProperty(hull, key);
  return hull;
}
export function parseProject(text: string): Project {
  const p = JSON.parse(text);
  const v = validate(p);
  if (v.errors.length) throw Error(v.errors.join("\n"));
  return p;
}
function scaleCandidate(p: Project, f: number) {
  if (!Number.isFinite(f) || f <= 0) throw Error("Scale must be positive.");
  const h = p.hull;
  h.width *= f;
  h.height *= f;
  h.center = h.center.map((n) => n * f) as Point;
  h.shieldCenter = h.shieldCenter.map((n) => n * f) as Point;
  h.shieldRadius *= f;
  h.collisionRadius *= f;
  h.bounds = h.bounds.map((n) => n * f);
  for (const s of h.weaponSlots)
    s.locations = s.locations.map((n) => n * f) as Locations;
  for (const e of h.engineSlots) {
    e.location = e.location.map((n: number) => n * f);
    for (const k of ["width", "length", "contrailSize"])
      if (typeof e[k] === "number") e[k] *= f;
  }
}
export function resize(p: Project, f: number) {
  const sourceErrors = validate(p).errors;
  if (sourceErrors.length) throw Error(sourceErrors.join("\n"));
  const candidate = clone(p);
  scaleCandidate(candidate, f);
  const errors = validate(candidate).errors;
  if (errors.length) throw Error(errors.join("\n"));
  Object.assign(p, candidate);
}
function historySnapshot(p:Project):Project {
  // Immutable image strings are shared; editing history only copies layout data.
  return {...clone({...p,image:""}),image:p.image};
}
export class History {
  items: Project[];
  index = 0;
  constructor(p: Project) {
    this.items = [historySnapshot(p)];
  }
  push(p: Project) {
    this.items = this.items.slice(0, this.index + 1);
    this.items.push(historySnapshot(p));
    if (this.items.length > 80) this.items.shift();
    this.index = this.items.length - 1;
  }
  undo() {
    return this.index > 0 ? historySnapshot(this.items[--this.index]) : null;
  }
  redo() {
    return this.index < this.items.length - 1
      ? historySnapshot(this.items[++this.index])
      : null;
  }
}
