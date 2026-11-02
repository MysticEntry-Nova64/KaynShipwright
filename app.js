"use strict";
(() => {
  // src/studio-ui.ts
  function installStudioUI(host) {
    const $2 = (id) => document.getElementById(id);
    const layout = $2("layoutMode"), focus = $2("focusMount"), search = $2("mountSearch");
    const tool = $2("editTool"), focusTool = $2("focusTool");
    focusTool.addEventListener("change", () => {
      tool.value = focusTool.value;
      tool.dispatchEvent(new Event("change", { bubbles: true }));
    });
    tool.addEventListener("change", () => focusTool.value = tool.value);
    const preference = "shipwright.studio.layout.v1";
    let saved = null;
    try {
      saved = localStorage.getItem(preference);
    } catch {
    }
    layout.value = saved === "focus" ? "focus" : "studio";
    function applyLayout() {
      document.body.dataset.layout = layout.value;
    }
    applyLayout();
    layout.addEventListener("change", () => {
      applyLayout();
      try {
        localStorage.setItem(preference, layout.value);
      } catch {
      }
      host.layoutChanged();
    });
    focus.addEventListener("change", () => host.selectMount(focus.value));
    function filter() {
      let visible = 0;
      for (const b of Array.from($2("mountList").querySelectorAll("button"))) {
        b.hidden = !b.textContent.toLowerCase().includes(search.value.trim().toLowerCase());
        if (!b.hidden) visible++;
      }
      $2("mountSearchEmpty").hidden = visible > 0 || !search.value;
    }
    search.addEventListener("input", filter);
    const menus = ["openMenu", "moreMenu"].map((id) => $2(id));
    for (const menu of menus) {
      menu.addEventListener("toggle", () => {
        if (menu.open) {
          for (const other of menus) if (other !== menu) other.open = false;
        }
      });
      menu.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => menu.open = false));
    }
    document.addEventListener("pointerdown", (e) => {
      for (const menu of menus) if (!menu.contains(e.target)) menu.open = false;
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        for (const menu of menus) if (menu.open) {
          menu.open = false;
          menu.querySelector("summary")?.focus();
        }
      }
    });
    const review = $2("exportReviewDialog"), scope = $2("exportReviewScope"), format = $2("exportReviewFormat");
    function reviewState() {
      const s = host.exportState(scope.value);
      $2("exportReviewSummary").textContent = s.names.join(", ") + " \xB7 " + s.mounts + " weapon mounts";
      $2("exportReviewChecks").textContent = s.errors.length ? s.errors.join("\n") : "\u2713 Layout checks passed for the selected scope.";
      $2("exportReviewChecks").className = s.errors.length ? "error" : "";
      $2("exportReviewContinue").disabled = !!s.errors.length;
      $2("exportReviewNext").textContent = format.value === "package" ? "Next: choose the package name/version, then its destination folder." : "Next: choose the layout file destination" + (scope.value === "all" ? " folder." : ".");
    }
    $2("reviewExport").addEventListener("click", () => {
      reviewState();
      review.showModal();
      $2("exportReviewContinue").focus();
    });
    $2("exportReviewClose").addEventListener("click", () => review.close());
    scope.addEventListener("change", reviewState);
    format.addEventListener("change", reviewState);
    $2("exportReviewContinue").addEventListener("click", () => {
      reviewState();
      if ($2("exportReviewContinue").disabled) return;
      const id = format.value === "package" ? scope.value === "all" ? "exportAll" : "exportPackage" : scope.value === "all" ? "exportShipsAll" : "export";
      review.close();
      $2(id).click();
    });
    function fileState(dirty2) {
      $2("projectFileState").textContent = dirty2 ? "\u25CF Unsaved changes \u2014 save a project copy" : "No new edits \u2014 recovery is separate from a project file";
      $2("projectFileState").dataset.dirty = String(dirty2);
    }
    return { fileState, refresh(project2, selected2, dirty2) {
      focus.replaceChildren(...project2.hull.weaponSlots.map((slot) => {
        const o = document.createElement("option");
        o.value = slot.id;
        o.textContent = slot.id + " \xB7 " + slot.size.toLowerCase() + " " + slot.type.toLowerCase();
        return o;
      }));
      if (selected2) focus.value = selected2;
      else focus.selectedIndex = -1;
      focus.disabled = !project2.hull.weaponSlots.length;
      $2("selectionSummary").textContent = selected2 ? "\xB7 " + selected2 : "";
      $2("objectBrowser").hidden = tool.value !== "weapons";
      focus.closest(".focus-picker").hidden = tool.value !== "weapons";
      focusTool.value = tool.value;
      fileState(dirty2);
      filter();
    } };
  }

  // src/package-dialog.ts
  var settings = {};
  var packageSettings = () => structuredClone(settings);
  function restorePackageSettings(value) {
    settings = value || {};
  }
  function choosePackageMetadata(defaultName, all = false, key = defaultName) {
    const dialog = document.getElementById("packageDialog");
    if (dialog.open) throw Error("Finish the open package dialog first.");
    const saved = all ? settings.all : settings.singles && Object.hasOwn(settings.singles, key) ? settings.singles[key] : void 0, name = document.getElementById("packageName"), version = document.getElementById("packageVersion");
    name.value = saved?.name || defaultName;
    version.value = saved?.version || "1.0.0";
    document.getElementById("packageScope").textContent = all ? "Combine every open ship into one design pack." : "Export the selected ship as a design pack.";
    dialog.returnValue = "";
    dialog.showModal();
    name.focus();
    name.select();
    return new Promise((resolve) => dialog.addEventListener("close", () => {
      if (dialog.returnValue !== "export") {
        resolve(false);
        return;
      }
      const metadata = { name: name.value.trim(), version: version.value.trim() };
      if (all) settings.all = metadata;
      else Object.defineProperty(settings.singles ??= {}, key, { value: metadata, enumerable: true, writable: true, configurable: true });
      document.dispatchEvent(new Event("package-settings-changed"));
      resolve(metadata);
    }, { once: true }));
  }

  // src/recovery-writer.ts
  var RecoveryWriter = class {
    pending;
    running;
    write;
    settled;
    constructor(write, settled) {
      this.write = write;
      this.settled = settled;
    }
    enqueue(value) {
      this.pending = { value };
      if (this.running) return;
      this.running = Promise.resolve().then(() => this.drain());
      void this.running.catch(() => {
      });
    }
    flush() {
      return this.running ?? Promise.resolve();
    }
    async drain() {
      let failure;
      try {
        while (this.pending) {
          const value = this.pending.value;
          this.pending = void 0;
          try {
            await this.write(value);
            failure = void 0;
          } catch (error) {
            failure = { error };
          }
        }
      } finally {
        this.running = void 0;
      }
      this.settled(failure ? { ok: false, error: failure.error } : { ok: true });
      if (failure) throw failure.error;
    }
  };

  // src/geometry.ts
  function edit(p, change) {
    const candidate = clone(p);
    change(candidate);
    const errors = validate(candidate).errors;
    if (errors.length) throw Error(errors.join("\n"));
    return candidate;
  }
  function outlineErrors(bounds) {
    if (!bounds.length) return [];
    if (bounds.length < 6)
      return ["bounds: use at least three vertices, or an empty outline."];
    const pts = [];
    for (let i = 0; i < bounds.length; i += 2)
      pts.push([bounds[i], bounds[i + 1]]);
    let overflow = false;
    const cross2 = (a, b, c) => {
      const value = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      if (!Number.isFinite(value)) overflow = true;
      return value;
    };
    const on2 = (a, b, c) => Math.abs(cross2(a, b, c)) < 1e-8 && c[0] >= Math.min(a[0], b[0]) - 1e-8 && c[0] <= Math.max(a[0], b[0]) + 1e-8 && c[1] >= Math.min(a[1], b[1]) - 1e-8 && c[1] <= Math.max(a[1], b[1]) + 1e-8;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6)
        return ["bounds: zero-length edge."];
      const previous = pts[(i + pts.length - 1) % pts.length];
      if (on2(previous, a, b) || on2(a, b, previous))
        return ["bounds: overlapping adjacent edges."];
      for (let j = i + 1; j < pts.length; j++) {
        if (j === i + 1 || i === 0 && j === pts.length - 1) continue;
        const c = pts[j], d = pts[(j + 1) % pts.length];
        if (cross2(a, b, c) * cross2(a, b, d) < 0 && cross2(c, d, a) * cross2(c, d, b) < 0 || on2(a, b, c) || on2(a, b, d) || on2(c, d, a) || on2(c, d, b))
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
  function addEngine(p, location) {
    p.hull.engineSlots.push({
      location,
      angle: 180,
      width: 10,
      length: 40,
      contrailSize: 20,
      style: "HIGH_TECH"
    });
  }
  function copyEngine(p, index, mirror2 = false) {
    const engine = clone(p.hull.engineSlots[index]);
    engine.location = mirror2 ? [engine.location[0], -engine.location[1]] : [engine.location[0] + 5, engine.location[1] + 5];
    if (mirror2) engine.angle = -engine.angle;
    p.hull.engineSlots.push(engine);
  }
  function rectangleBounds(p) {
    const h = p.hull;
    const front = h.height - h.center[1], back = -h.center[1];
    h.bounds = [
      back,
      h.center[0],
      front,
      h.center[0],
      front,
      h.center[0] - h.width,
      back,
      h.center[0] - h.width
    ];
  }
  function insertVertex(p, point3) {
    const b = p.hull.bounds;
    if (b.length < 6) throw Error("Create a rectangle outline first.");
    let best = Infinity, index = 0, nearest = point3;
    for (let i = 0; i < b.length; i += 2) {
      const j = (i + 2) % b.length, a = [b[i], b[i + 1]], d = [b[j] - a[0], b[j + 1] - a[1]], len = d[0] * d[0] + d[1] * d[1];
      const t = Math.max(
        0,
        Math.min(1, ((point3[0] - a[0]) * d[0] + (point3[1] - a[1]) * d[1]) / len)
      );
      const q = [a[0] + t * d[0], a[1] + t * d[1]], distance = Math.hypot(q[0] - point3[0], q[1] - point3[1]);
      if (distance < best) {
        best = distance;
        index = i + 2;
        nearest = q;
      }
    }
    b.splice(index, 0, ...nearest);
    return index / 2;
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

  // src/auto-outline.ts
  var cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  function convex(points) {
    const sorted = [...points].sort((a2, b2) => a2[0] - b2[0] || a2[1] - b2[1]);
    const half = (list) => {
      const h = [];
      for (const p of list) {
        while (h.length > 1 && cross(h[h.length - 2], h[h.length - 1], p) <= 0) h.pop();
        h.push(p);
      }
      return h;
    };
    const a = half(sorted), b = half([...sorted].reverse());
    a.pop();
    b.pop();
    return [...a, ...b];
  }
  function rdp(points, tolerance) {
    if (points.length < 3) return points;
    const a = points[0], b = points[points.length - 1], dx = b[0] - a[0], dy = b[1] - a[1], length = dx * dx + dy * dy;
    let best = 0, index = 0;
    for (let i = 1; i < points.length - 1; i++) {
      const p = points[i], t = length ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length)) : 0, d = Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
      if (d > best) {
        best = d;
        index = i;
      }
    }
    return best > tolerance ? [...rdp(points.slice(0, index + 1), tolerance).slice(0, -1), ...rdp(points.slice(index), tolerance)] : [a, b];
  }
  function simplify(points, tolerance) {
    let far = 1;
    for (let i = 2; i < points.length; i++) if (Math.hypot(points[i][0] - points[0][0], points[i][1] - points[0][1]) > Math.hypot(points[far][0] - points[0][0], points[far][1] - points[0][1])) far = i;
    return [...rdp(points.slice(0, far + 1), tolerance).slice(0, -1), ...rdp([...points.slice(far), points[0]], tolerance).slice(0, -1)];
  }
  function generateOutline(mask, requested = "contour") {
    const { width: w, height: h, alpha } = mask;
    if (w < 1 || h < 1 || w * h > 512 * 512 || alpha.length !== w * h) throw Error("Invalid outline mask.");
    const occupied = new Uint8Array(w * h), labels = new Int32Array(w * h), sizes2 = [0];
    let total = 0;
    for (let i = 0; i < alpha.length; i++) {
      occupied[i] = alpha[i] >= 128 ? 1 : 0;
      total += occupied[i];
    }
    if (!total) throw Error("No opaque hull pixels found; outline left empty.");
    const queue = new Int32Array(w * h);
    for (let i = 0; i < occupied.length; i++) if (occupied[i] && !labels[i]) {
      const id = sizes2.length;
      let head = 0, tail = 1;
      queue[0] = i;
      labels[i] = id;
      while (head < tail) {
        const n = queue[head++], x = n % w, y = Math.floor(n / w);
        for (const q of [x ? n - 1 : -1, x + 1 < w ? n + 1 : -1, y ? n - w : -1, y + 1 < h ? n + w : -1]) if (q >= 0 && occupied[q] && !labels[q]) {
          labels[q] = id;
          queue[tail++] = q;
        }
      }
      sizes2.push(tail);
    }
    let largest = 1;
    for (let i = 2; i < sizes2.length; i++) if (sizes2[i] > sizes2[largest]) largest = i;
    const all = [], edges = /* @__PURE__ */ new Map(), stride = w + 1;
    const edge = (x, y, X, Y) => {
      const key = y * stride + x;
      const list = edges.get(key) || [];
      list.push(Y * stride + X);
      edges.set(key, list);
    };
    let minX = w, minY = h, maxX = 0, maxY = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (occupied[y * w + x]) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + 1);
      maxY = Math.max(maxY, y + 1);
      if (!x || !y || x === w - 1 || y === h - 1 || !occupied[y * w + x - 1] || !occupied[y * w + x + 1] || !occupied[(y - 1) * w + x] || !occupied[(y + 1) * w + x]) all.push([x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1]);
      if (labels[y * w + x] === largest) {
        const has = (X, Y) => X >= 0 && X < w && Y >= 0 && Y < h && labels[Y * w + X] === largest;
        if (!has(x, y - 1)) edge(x, y, x + 1, y);
        if (!has(x + 1, y)) edge(x + 1, y, x + 1, y + 1);
        if (!has(x, y + 1)) edge(x + 1, y + 1, x, y + 1);
        if (!has(x - 1, y)) edge(x, y + 1, x, y);
      }
    }
    const components = sizes2.length - 1, fallback = (reason) => ({ points: convex(all), method: "convex", reason, components });
    if (requested === "rectangle") return { points: [[minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY]], method: requested, components };
    if (requested === "convex") return fallback("Requested convex comparison.");
    if ((total - sizes2[largest]) / total > 0.01) return fallback("Disconnected hull pieces exceed 1%; convex outline includes them.");
    if ([...edges.values()].some((v) => v.length !== 1)) return fallback("Ambiguous touching boundary.");
    const loops = [];
    while (edges.size) {
      const start = edges.keys().next().value;
      let at = start;
      const loop = [];
      do {
        loop.push([at % stride, Math.floor(at / stride)]);
        const next = edges.get(at);
        if (!next) return fallback("Open contour.");
        edges.delete(at);
        at = next[0];
      } while (at !== start);
      loops.push(loop);
    }
    const area = (p) => Math.abs(p.reduce((s, a, i) => {
      const b = p[(i + 1) % p.length];
      return s + a[0] * b[1] - b[0] * a[1];
    }, 0));
    loops.sort((a, b) => area(b) - area(a));
    let tolerance = 1.2, points = simplify(loops[0], tolerance);
    while (points.length > 48 && tolerance < 32) {
      tolerance *= 1.4;
      points = simplify(loops[0], tolerance);
    }
    if (points.length > 48 || outlineErrors(points.flat()).length) return fallback("Simplified contour failed polygon validation.");
    return { points, method: "contour", components, ...components > 1 ? { reason: "Tiny detached pixels ignored (at most 1% opaque area)." } : {} };
  }
  async function outlineForProject(p) {
    const image = new Image();
    image.src = p.image;
    await image.decode();
    const scale = Math.min(1, 512 / Math.max(image.naturalWidth, image.naturalHeight)), w = Math.max(1, Math.round(image.naturalWidth * scale)), h = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(image, 0, 0, w, h);
    const rgba = context.getImageData(0, 0, w, h).data, alpha = new Uint8Array(w * h);
    for (let i = 0; i < alpha.length; i++) alpha[i] = rgba[i * 4 + 3];
    const result = generateOutline({ width: w, height: h, alpha }), bounds = result.points.flatMap(([x, y]) => toGame(p, [x * p.hull.width / w, y * p.hull.height / h]));
    const errors = outlineErrors(bounds);
    if (errors.length) throw Error(errors.join(" "));
    return { bounds, result };
  }

  // src/preview.ts
  async function previewPNG(p) {
    const h = p.hull, img = new Image();
    img.src = p.image;
    await img.decode();
    const coordinates = [
      [0, 0],
      [h.width, h.height]
    ], shield = toScreen(p, h.shieldCenter), origin = toScreen(p, [0, 0]);
    coordinates.push(
      [shield[0] - h.shieldRadius, shield[1] - h.shieldRadius],
      [shield[0] + h.shieldRadius, shield[1] + h.shieldRadius],
      [origin[0] - h.collisionRadius, origin[1] - h.collisionRadius],
      [origin[0] + h.collisionRadius, origin[1] + h.collisionRadius]
    );
    h.engineSlots.forEach((e) => {
      const a = toScreen(p, e.location), r = e.angle * Math.PI / 180;
      coordinates.push(
        [a[0] - e.width, a[1] - e.width],
        [a[0] + e.width, a[1] + e.width],
        [a[0] - Math.sin(r) * e.length, a[1] - Math.cos(r) * e.length]
      );
    });
    for (let i = 0; i < h.bounds.length; i += 2)
      coordinates.push(toScreen(p, [h.bounds[i], h.bounds[i + 1]]));
    h.weaponSlots.forEach(
      (s) => slotPoints(s.locations).forEach(
        (point3) => coordinates.push(toScreen(p, point3))
      )
    );
    const minX = Math.min(...coordinates.map((q) => q[0])) - 30, minY = Math.min(...coordinates.map((q) => q[1])) - 30;
    const width = Math.max(...coordinates.map((q) => q[0])) - minX + 30, height = Math.max(...coordinates.map((q) => q[1])) - minY + 30;
    if (!Number.isFinite(width) || !Number.isFinite(height))
      throw Error("Geometry exceeds preview range.");
    const scale = Math.min(2, 1400 / width, 1200 / height), canvas = document.createElement("canvas");
    canvas.width = 1500;
    canvas.height = 1400;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#101a20";
    ctx.fillRect(0, 0, 1500, 1400);
    ctx.fillStyle = "#e4eff1";
    ctx.font = "24px Segoe UI";
    ctx.fillText(`${h.hullName} \u2014 Shipwright V1.2.2`, 30, 36);
    ctx.font = "16px Segoe UI";
    ctx.fillText(
      "BOW \u2191  |  Orange: engines  Blue: shield  Green: bounds  Purple: collision radius",
      30,
      66
    );
    ctx.save();
    ctx.translate(30 - minX * scale, 100 - minY * scale);
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0, h.width, h.height);
    ctx.lineWidth = 1.5 / scale;
    ctx.font = `${12 / scale}px Segoe UI`;
    const circle = (q, r, color) => {
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.arc(q[0], q[1], r, 0, Math.PI * 2);
      ctx.stroke();
    };
    circle(shield, h.shieldRadius, "#73cafa");
    circle(origin, h.collisionRadius, "#dc98e8");
    ctx.strokeStyle = "#b0e699";
    ctx.beginPath();
    for (let i = 0; i < h.bounds.length; i += 2) {
      const q = toScreen(p, [h.bounds[i], h.bounds[i + 1]]);
      i ? ctx.lineTo(...q) : ctx.moveTo(...q);
      ctx.fillStyle = "#b0e699";
      ctx.fillText(`B${i / 2 + 1}`, q[0] + 3, q[1] - 3);
    }
    if (h.bounds.length) ctx.closePath();
    ctx.stroke();
    h.engineSlots.forEach((e, i) => {
      const q = toScreen(p, e.location), r = e.angle * Math.PI / 180, d = [-Math.sin(r), -Math.cos(r)], side = [Math.cos(r), -Math.sin(r)], tip = [q[0] + d[0] * e.length, q[1] + d[1] * e.length];
      ctx.strokeStyle = "#ffad70";
      ctx.fillStyle = "#ffad70";
      ctx.beginPath();
      ctx.moveTo(q[0] + side[0] * e.width / 2, q[1] + side[1] * e.width / 2);
      ctx.lineTo(q[0] - side[0] * e.width / 2, q[1] - side[1] * e.width / 2);
      ctx.moveTo(...q);
      ctx.lineTo(...tip);
      ctx.lineTo(
        tip[0] - d[0] * 5 + side[0] * 3,
        tip[1] - d[1] * 5 + side[1] * 3
      );
      ctx.moveTo(...tip);
      ctx.lineTo(
        tip[0] - d[0] * 5 - side[0] * 3,
        tip[1] - d[1] * 5 - side[1] * 3
      );
      ctx.stroke();
      ctx.fillText(`E${i + 1}`, q[0] + 5, q[1] - 5);
    });
    h.weaponSlots.forEach(
      (s) => slotPoints(s.locations).forEach((position) => {
        const q = toScreen(p, position);
        circle(q, 3, "#e9cf77");
        ctx.fillStyle = "#e9cf77";
        ctx.fillText(s.id, q[0] + 4, q[1]);
      })
    );
    ctx.fillStyle = "#73cafa";
    ctx.fillText(`Shield r ${h.shieldRadius}`, shield[0], shield[1]);
    ctx.restore();
    ctx.fillStyle = "#b7cdd6";
    ctx.font = "16px Segoe UI";
    ctx.fillText(
      `${h.hullId} | ${h.width} \xD7 ${h.height} units | ${h.engineSlots.length} engines | ${h.bounds.length / 2} vertices`,
      30,
      1350
    );
    ctx.fillText(
      "Design geometry preview. Verify behavior in the target game; stats and variants are separate.",
      30,
      1378
    );
    return canvas.toDataURL("image/png");
  }

  // src/png-drop.ts
  var DROP_FILES = 16;
  var DROP_BYTES = 8e7;
  var DROP_PIXELS = 32e6;
  async function preparePNGDrop(files, existingIds, alive) {
    if (!files.length || files.length + existingIds.length > DROP_FILES) throw Error("Keep at most 16 dropped designs in one window.");
    if (files.some((f) => !f.name.toLowerCase().endsWith(".png"))) throw Error("A PNG batch must contain only PNG files.");
    if (files.reduce((n, f) => n + f.size, 0) > DROP_BYTES) throw Error("PNG batch limit is 80 MB.");
    let pixels = 0;
    const headers = [];
    for (const file of files) {
      if (file.size > 4e7) throw Error("File limit is 40 MB.");
      const h = new Uint8Array(await file.slice(0, 24).arrayBuffer());
      if (h.length < 24 || ![137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => h[i] === v) || String.fromCharCode(...h.slice(12, 16)) !== "IHDR") throw Error(`Invalid PNG: ${file.name}`);
      const view = new DataView(h.buffer, h.byteOffset, h.byteLength), width = view.getUint32(16), height = view.getUint32(20);
      if (!width || !height || width > 16384 || height > 16384) throw Error("Maximum PNG dimension is 16384 pixels.");
      pixels += width * height;
      if (pixels > DROP_PIXELS) throw Error("PNG batch pixel limit is 32 million.");
      headers.push({ width, height });
    }
    const projects = [];
    const ids = new Set(existingIds);
    for (let i = 0; i < files.length; i++) {
      if (!alive()) return [];
      const f = files[i], { width, height } = headers[i];
      const image = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(Error(`Unable to read ${f.name}`));
        reader.readAsDataURL(f);
      });
      const decoded = new Image();
      decoded.src = image;
      await decoded.decode();
      if (decoded.width !== width || decoded.height !== height) throw Error("PNG dimensions changed during decode.");
      const base = f.name.replace(/\.png$/i, "").replace(/[^a-zA-Z0-9_-]/g, "_") || "new_ship";
      let id = base, n = 2;
      while (ids.has(id)) id = base + "_" + n++;
      ids.add(id);
      const kind = base.match(/(?:^|_)(frigate|destroyer|cruiser|capital)(?:_ship)?$/i)?.[1]?.toLowerCase();
      const cls = kind === "capital" ? "CAPITAL_SHIP" : kind?.toUpperCase() || "DESTROYER";
      const p = fromShip({ hullId: id, hullName: base.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()), hullSize: cls, style: "HIGH_TECH", width, height, center: [width / 2, height / 2], spriteName: `graphics/ships/${id}.png`, collisionRadius: Math.min(width, height) / 2, shieldCenter: [0, 0], shieldRadius: Math.max(width, height) / 2, bounds: [], weaponSlots: [], engineSlots: [] }, image);
      if (kind) resize(p, { frigate: 160, destroyer: 240, cruiser: 320, capital: 480 }[kind] / height);
      projects.push(p);
    }
    return projects;
  }

  // src/ship-library.ts
  function installShipLibrary(host) {
    const $2 = (id) => document.getElementById(id);
    const dialog = $2("importDialog"), message = (text) => {
      $2("importStatus").textContent = text;
    };
    let sources = [], selected2, busy = false, selectedReady = false, previewGeneration = 0;
    let sourceChosen = false;
    function updateGuide() {
      $2("importEmptyGuide").hidden = sourceChosen;
      $2("importSources").hidden = !sourceChosen;
    }
    function controls() {
      for (const id of ["importChooseRoot", "importChooseShip"])
        $2(id).disabled = busy;
      $2("importAdd").disabled = busy || !selected2 || !!selected2.error || !selectedReady;
      for (const b of dialog.querySelectorAll(
        "[data-source],[data-library]"
      ))
        b.disabled = busy || !!b.dataset.invalid;
    }
    async function action(work) {
      if (busy) return;
      busy = true;
      controls();
      try {
        await work();
      } catch (e) {
        message(String(e));
      } finally {
        busy = false;
        controls();
      }
    }
    function row(text, detail) {
      const b = document.createElement("button");
      b.type = "button";
      b.append(document.createTextNode(text));
      const small = document.createElement("small");
      small.textContent = detail;
      b.append(small);
      return b;
    }
    function renderSources() {
      const list = $2("importSources");
      list.replaceChildren();
      const query = $2("importSearch").value.toLowerCase();
      for (const entry of sources.filter(
        (s) => `${s.name} ${s.hullId} ${s.source}`.toLowerCase().includes(query)
      )) {
        const b = row(
          entry.name,
          `${entry.source} \xB7 ${entry.hullSize} \xB7 ${entry.hullId}${entry.error ? " \xB7 " + entry.error : ""}`
        );
        b.dataset.source = entry.id;
        if (entry.error) b.dataset.invalid = "true";
        b.onclick = () => void action(async () => {
          selected2 = entry;
          selectedReady = false;
          const generation = ++previewGeneration;
          $2("importPreviewName").textContent = entry.name;
          $2("importSourceDetails").textContent = `${entry.source} \xB7 ${entry.hullSize} \xB7 ${entry.hullId}`;
          $2("importPreview").hidden = true;
          message("Loading sprite preview\u2026");
          try {
            const result = await window.desktop.previewShip(entry.id);
            if (generation !== previewGeneration) return;
            selectedReady = !result.issues.length;
            if (result.needsSprite) {
              message(
                `${result.message} Add to library to choose the matching PNG.`
              );
              return;
            }
            const img = $2("importPreview");
            img.src = result.image;
            await img.decode();
            if (generation !== previewGeneration || !dialog.open) return;
            img.hidden = false;
            message(
              result.issues.length ? "Preview available. Editing requires resolving: " + result.issues.join(" ") : "Ready to add an independent copy to your library."
            );
          } catch (e) {
            selectedReady = false;
            message(String(e));
          }
        });
        list.append(b);
      }
      if (!list.children.length)
        list.textContent = sources.length ? "No matching ships." : sourceChosen ? "No ship files in the current source list. Browse another folder to see more ships." : "";
      updateGuide();
      controls();
    }
    async function refreshLibrary() {
      const result = await window.desktop.libraryList(), list = $2("importLibrary");
      list.replaceChildren();
      for (const entry of result.entries) {
        const b = row(
          `Open copy: ${entry.name}`,
          `${entry.source} \xB7 ${entry.hullSize} \xB7 ${entry.hullId}`
        );
        b.dataset.library = entry.id;
        b.onclick = () => void action(async () => {
          if (!host.mayReplace()) return;
          const ticket = host.begin(), name = $2("importCopyName").value.trim(), id = $2("importCopyId").value.trim();
          const project2 = clone(await window.desktop.libraryGet(entry.id));
          project2.hull.hullName = name || `${project2.hull.hullName} (copy)`;
          project2.hull.hullId = id || `${project2.hull.hullId.slice(0, 180)}_copy`;
          project2.hull.spriteName = `graphics/ships/${project2.hull.hullId}.png`;
          const errors = validate(project2).errors;
          if (errors.length) throw Error(errors.join("\n"));
          const image = new Image();
          image.src = project2.image;
          await image.decode();
          if (!host.accepts(ticket)) {
            message(
              "The project changed while loading. Open the library copy again when ready."
            );
            return;
          }
          if (!dialog.open) {
            message("Opening canceled. Your current project is unchanged.");
            return;
          }
          sourceChosen = true;
          renderSources();
          host.open(project2);
          dialog.close();
        });
        list.append(b);
      }
      if (!result.entries.length) list.textContent = "No imported ships yet.";
      if (result.warnings.length)
        message(
          "Some saved entries could not be read: " + result.warnings.join("; ")
        );
      controls();
    }
    async function add(id) {
      const result = await window.desktop.importShip(id);
      if (!result) {
        message("Import canceled. No library or project changes.");
        return;
      }
      sourceChosen = true;
      renderSources();
      await refreshLibrary();
      message(
        result.duplicate ? "This exact source is already in your library." : "Added to your library. Open a copy below to edit it."
      );
    }
    $2("starsectorImport").onclick = () => {
      dialog.showModal();
      if (!window.desktop) {
        message("Starsector import requires the desktop app.");
        return;
      }
      void action(refreshLibrary);
    };
    $2("importClose").onclick = () => dialog.close();
    dialog.addEventListener("close", () => {
      ++previewGeneration;
      const image = $2("importPreview");
      image.hidden = true;
      image.removeAttribute("src");
    });
    $2("importChooseRoot").onclick = () => void action(async () => {
      message("Looking for ship files\u2026");
      const result = await window.desktop.scanShips();
      if (!result) {
        message("Folder selection canceled.");
        return;
      }
      sources = result;
      sourceChosen = true;
      selected2 = void 0;
      ++previewGeneration;
      $2("importPreview").hidden = true;
      $2("importPreviewName").textContent = "Select a ship to preview";
      renderSources();
      message(`Found ${sources.length} ship files. Select one to preview.`);
    });
    $2("importChooseShip").onclick = () => void action(() => add());
    $2("importAdd").onclick = () => void action(() => add(selected2?.id));
    $2("importSearch").oninput = renderSources;
    renderSources();
  }

  // src/startup.ts
  function installStartup(desktop) {
    const dialog = document.getElementById("locationDialog");
    const status2 = document.getElementById("locationStatus");
    const choose = document.getElementById("locationChoose");
    const later = document.getElementById("locationLater");
    const notice = document.getElementById("instanceNotice");
    const show = (message) => {
      notice.hidden = false;
      document.getElementById("instanceMessage").textContent = message;
    };
    document.getElementById("instanceDismiss").onclick = () => {
      notice.hidden = true;
    };
    desktop?.onAlreadyOpen(
      () => show("Shipwright is already open. Only one instance can run at a time.")
    );
    later.onclick = () => dialog.close();
    choose.onclick = async () => {
      choose.disabled = later.disabled = true;
      try {
        const result = await desktop.chooseStarsectorLocation();
        if (result) dialog.close();
        else
          status2.textContent = "No folder selected. You can try again or choose Later.";
      } catch (error) {
        status2.textContent = String(error).replace(
          /^Error: Error invoking remote method '[^']+': (?:Error: )?/,
          ""
        );
      } finally {
        choose.disabled = later.disabled = false;
      }
    };
    if (desktop)
      void desktop.starsectorLocation().then((result) => {
        if (result.needsSelection) {
          status2.textContent = result.warning || "Select the folder that contains starsector-core. You can change it later from the import browser.";
          dialog.showModal();
        }
      }).catch((error) => {
        status2.textContent = `Could not check the saved location: ${error}`;
        dialog.showModal();
      });
  }

  // src/document-session.ts
  var documentSequence = 0;
  var DocumentSession = class {
    document = 0;
    revision = 0;
    saved = 0;
    generation = 0;
    sequence = 0;
    get dirty() {
      return this.revision !== this.saved;
    }
    load(unsaved = false) {
      this.document = ++documentSequence;
      this.revision = ++this.sequence;
      this.saved = unsaved ? -1 : this.revision;
      this.generation++;
    }
    change() {
      this.revision = ++this.sequence;
      this.generation++;
    }
    restore(revision) {
      this.revision = revision;
      this.generation++;
    }
    beginLoad() {
      return {
        generation: ++this.generation,
        document: this.document,
        revision: this.revision
      };
    }
    accepts(ticket) {
      return ticket.generation === this.generation && ticket.document === this.document && ticket.revision === this.revision;
    }
    beginSave() {
      return { document: this.document, revision: this.revision };
    }
    // The renderer serializes saves. Undo revisions are not save-operation order.
    finishSave(ticket) {
      if (ticket.document === this.document) this.saved = ticket.revision;
    }
  };

  // src/gesture.ts
  var GestureController = class {
    constructor(svg2) {
      this.svg = svg2;
      svg2.addEventListener(
        "pointerup",
        (e) => {
          if (this.owns(e.pointerId)) this.finish();
        },
        true
      );
      svg2.addEventListener(
        "pointercancel",
        (e) => {
          if (this.owns(e.pointerId)) this.cancel();
        },
        true
      );
      svg2.addEventListener("lostpointercapture", (e) => {
        if (this.owns(e.pointerId)) this.cancel();
      });
      window.addEventListener(
        "keydown",
        (e) => {
          if (e.key === "Escape") this.cancel();
        },
        true
      );
      window.addEventListener("blur", () => this.cancel());
    }
    svg;
    active = null;
    owns(pointerId) {
      return this.active?.pointerId === pointerId;
    }
    begin(pointerId, end) {
      this.cancel();
      this.active = { pointerId, end };
      this.svg.setPointerCapture(pointerId);
    }
    cancel() {
      this.finish(true);
    }
    finish(cancel = false) {
      const active = this.active;
      if (!active) return;
      this.active = null;
      try {
        active.end(cancel);
      } finally {
        if (this.svg.hasPointerCapture(active.pointerId))
          this.svg.releasePointerCapture(active.pointerId);
      }
    }
  };

  // src/geometry-editor.ts
  var NS = "http://www.w3.org/2000/svg";
  function installGeometry(host) {
    const $2 = (id) => document.getElementById(id);
    const input = (id) => $2(id);
    let selection = null, drag2 = null;
    const mode = () => input("editTool").value;
    const menu = $2("geometryMenu");
    const round = (n) => Math.round(n * 10) / 10;
    const screenPoint = (event) => {
      const matrix = host.svg.getScreenCTM();
      if (!matrix) throw Error("Canvas unavailable");
      const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(
        matrix.inverse()
      );
      return [p.x, p.y];
    };
    function node(tag, attrs, parent = host.svg) {
      const e = document.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
      parent.append(e);
      return e;
    }
    function handle(p, kind, index, title, color, shape = "circle") {
      const attrs = shape === "rect" ? { x: p[0] - 3, y: p[1] - 3, width: 6, height: 6 } : { cx: p[0], cy: p[1], r: 3.5 };
      const e = node(shape, {
        ...attrs,
        fill: color,
        stroke: "#09151b",
        "stroke-width": 0.8,
        "data-geometry": kind,
        "data-index": index,
        tabindex: 0,
        role: "button",
        "aria-label": title,
        class: "geometry-handle"
      });
      node("title", {}, e).textContent = title;
      return e;
    }
    function label(p, text, color) {
      node("text", {
        x: p[0] + 5,
        y: p[1] - 5,
        fill: color,
        class: "geometry-label"
      }).textContent = text;
    }
    function line(a, b, color, extra = {}) {
      node("line", {
        x1: a[0],
        y1: a[1],
        x2: b[0],
        y2: b[1],
        stroke: color,
        "stroke-width": 1,
        "pointer-events": "none",
        ...extra
      });
    }
    function draw2() {
      if (!host.get()) return;
      host.svg.dataset.tool = mode();
      const p = host.get(), h = p.hull;
      if (input("showBounds").checked || mode() === "engines")
        h.engineSlots.forEach((e, i) => {
          const q = toScreen(p, e.location), rad = e.angle * Math.PI / 180, dir = [-Math.sin(rad), -Math.cos(rad)], side = [Math.cos(rad), -Math.sin(rad)];
          const tip = [q[0] + dir[0] * e.length, q[1] + dir[1] * e.length];
          const a = [
            q[0] + side[0] * e.width / 2,
            q[1] + side[1] * e.width / 2
          ], b = [
            q[0] - side[0] * e.width / 2,
            q[1] - side[1] * e.width / 2
          ];
          const col = selection?.kind === "engine" && selection.index === i ? "#fff3bc" : "#ffad70";
          line(a, b, col, { "stroke-width": 2 });
          line(q, tip, col);
          line(
            tip,
            [
              tip[0] - dir[0] * 6 + side[0] * 3,
              tip[1] - dir[1] * 6 + side[1] * 3
            ],
            col
          );
          line(
            tip,
            [
              tip[0] - dir[0] * 6 - side[0] * 3,
              tip[1] - dir[1] * 6 - side[1] * 3
            ],
            col
          );
          label(q, `E${i + 1} \xB7 ${round(e.width)}w \xB7 ${round(e.angle)}\xB0`, col);
          if (mode() === "engines") {
            handle(q, "engine", i, `Engine ${i + 1}: drag position`, col, "rect");
            if (selection?.kind === "engine" && selection.index === i) {
              handle(
                tip,
                "engineDirection",
                i,
                "Drag exhaust direction and length",
                "#ffd574"
              );
              handle(
                [a[0] + side[0] * 8, a[1] + side[1] * 8],
                "engineWidth",
                i,
                "Drag engine width",
                "#ffc895"
              );
            }
          }
        });
      if (input("showShield").checked || mode() === "shield") {
        const q = toScreen(p, h.shieldCenter), r = h.shieldRadius;
        node("circle", {
          cx: q[0],
          cy: q[1],
          r,
          fill: "none",
          stroke: "#73cafa",
          "stroke-width": 1,
          "stroke-dasharray": "5 3",
          "pointer-events": "none"
        });
        line([q[0] - 5, q[1]], [q[0] + 5, q[1]], "#73cafa");
        line([q[0], q[1] - 5], [q[0], q[1] + 5], "#73cafa");
        label(q, `Shield \xB7 r ${round(r)}`, "#73cafa");
        if (mode() === "shield") {
          handle(q, "shield", 0, "Drag shield center", "#73cafa", "rect");
          handle([q[0] + r, q[1]], "radius", 0, "Drag shield radius", "#b5eaff");
        }
      }
      if (input("showBounds").checked || mode() === "bounds") {
        const points = [];
        for (let i = 0; i < h.bounds.length; i += 2)
          points.push(toScreen(p, [h.bounds[i], h.bounds[i + 1]]));
        node("polygon", {
          points: points.map((q) => q.join(",")).join(" "),
          fill: "none",
          stroke: "#b0e699",
          "stroke-width": 1,
          "pointer-events": "none"
        });
        if (mode() === "bounds") {
          points.forEach((q, i) => {
            handle(
              q,
              "vertex",
              i,
              `Bounds vertex ${i + 1}: drag; right-click for options`,
              selection?.kind === "vertex" && selection.index === i ? "#ffffff" : "#b0e699"
            );
            label(q, `B${i + 1}`, "#b0e699");
          });
          const center = toScreen(p, [0, 0]);
          node("circle", {
            cx: center[0],
            cy: center[1],
            r: h.collisionRadius,
            fill: "none",
            stroke: "#dc98e8",
            "stroke-width": 0.6,
            "stroke-dasharray": "2 4",
            "pointer-events": "none"
          });
          handle(
            [center[0] + h.collisionRadius, center[1]],
            "collision",
            0,
            "Drag collision radius",
            "#dc98e8"
          );
          label(center, `Collision r ${round(h.collisionRadius)}`, "#dc98e8");
        }
      }
    }
    function perform(change) {
      try {
        host.gestures.finish();
        host.set(edit(host.get(), change));
        host.commit();
      } catch (e) {
        host.status(`Edit rejected: ${e}`);
        host.render();
      }
    }
    function render2() {
      if (!host.get()) return;
      $2("geometryInspector").hidden = mode() === "weapons";
      $2("weaponInspector").hidden = mode() !== "weapons";
      $2("geometrySelection").textContent = selection ? selection.kind === "engine" ? `Engine ${selection.index + 1}` : selection.kind === "vertex" ? `Bounds vertex ${selection.index + 1}` : selection.kind === "shield" ? "Shield center" : selection.kind === "radius" ? "Shield radius" : "Collision radius" : "Right-click the canvas to add or select geometry.";
      const fields = $2("geometryFields");
      fields.replaceChildren();
      if (!selection) return;
      const s = selection, h = host.get().hull;
      const field = (title, value, update, numeric = true) => {
        const l = document.createElement("label");
        l.textContent = title;
        const i = document.createElement("input");
        i.type = numeric ? "number" : "text";
        i.step = "0.1";
        i.value = String(value);
        i.dataset.field = title;
        i.addEventListener("change", () => {
          const v = numeric ? Number(i.value) : i.value;
          if (numeric && (!i.value.trim() || !Number.isFinite(v))) {
            host.status("Use a finite number.");
            render2();
            return;
          }
          perform((p) => update(p, v));
        });
        l.append(i);
        fields.append(l);
      };
      if (s.kind === "engine") {
        const e = h.engineSlots[s.index];
        if (!e) {
          selection = null;
          return;
        }
        field(
          "Forward",
          e.location[0],
          (p, v) => p.hull.engineSlots[s.index].location[0] = v
        );
        field(
          "Port",
          e.location[1],
          (p, v) => p.hull.engineSlots[s.index].location[1] = v
        );
        for (const [key, title] of [
          ["angle", "Exhaust direction \xB0"],
          ["width", "Engine width"],
          ["length", "Exhaust length"],
          ["contrailSize", "Contrail size"]
        ])
          field(
            title,
            e[key] ?? 0,
            (p, v) => p.hull.engineSlots[s.index][key] = v
          );
        field(
          "Engine style",
          e.style ?? "HIGH_TECH",
          (p, v) => {
            if (!/^[A-Z0-9_]+$/.test(v)) throw Error("Use an engine style ID.");
            p.hull.engineSlots[s.index].style = v;
          },
          false
        );
      } else if (s.kind === "shield" || s.kind === "radius") {
        field(
          "Shield forward",
          h.shieldCenter[0],
          (p, v) => p.hull.shieldCenter[0] = v
        );
        field(
          "Shield port",
          h.shieldCenter[1],
          (p, v) => p.hull.shieldCenter[1] = v
        );
        field(
          "Shield radius",
          h.shieldRadius,
          (p, v) => p.hull.shieldRadius = v
        );
      } else if (s.kind === "vertex") {
        field(
          "Vertex forward",
          h.bounds[s.index * 2],
          (p, v) => p.hull.bounds[s.index * 2] = v
        );
        field(
          "Vertex port",
          h.bounds[s.index * 2 + 1],
          (p, v) => p.hull.bounds[s.index * 2 + 1] = v
        );
      } else
        field(
          "Collision radius",
          h.collisionRadius,
          (p, v) => p.hull.collisionRadius = v
        );
    }
    function getSelection(target) {
      const e = target.closest("[data-geometry]");
      if (!e) return null;
      const kind = e.getAttribute("data-geometry"), index = Number(e.getAttribute("data-index"));
      if (kind.startsWith("engine")) return { kind: "engine", index };
      if (kind === "vertex") return { kind, index };
      return { kind };
    }
    host.svg.addEventListener(
      "pointerdown",
      (event) => {
        if (mode() === "weapons") return;
        event.stopImmediatePropagation();
        menu.hidden = true;
        if (event.button !== 0) return;
        host.gestures.cancel();
        host.invalidate();
        const target = event.target, s = getSelection(target);
        selection = s;
        render2();
        if (!s) {
          host.draw();
          return;
        }
        const specific = target.closest("[data-geometry]").getAttribute("data-geometry");
        drag2 = {
          selection: s,
          before: clone(host.get()),
          start: screenPoint(event),
          moved: false
        };
        host.svg.dataset.dragKind = specific;
        host.gestures.begin(event.pointerId, end);
        host.draw();
      },
      true
    );
    host.svg.addEventListener(
      "pointermove",
      (event) => {
        if (!drag2 || !host.gestures.owns(event.pointerId)) return;
        event.stopImmediatePropagation();
        const q = screenPoint(event), s = drag2.selection, before = drag2.before;
        if (Math.hypot(q[0] - drag2.start[0], q[1] - drag2.start[1]) < 0.1) return;
        drag2.moved = true;
        const p = clone(before), h = p.hull, kind = host.svg.dataset.dragKind;
        if (s.kind === "engine") {
          const e = h.engineSlots[s.index], origin = toScreen(p, e.location), dx = q[0] - origin[0], dy = q[1] - origin[1];
          if (kind === "engineDirection") {
            e.angle = round(Math.atan2(-dx, -dy) * 180 / Math.PI);
            e.length = round(Math.max(0.1, Math.hypot(dx, dy)));
          } else if (kind === "engineWidth") {
            const rad = e.angle * Math.PI / 180;
            e.width = round(
              Math.max(
                0.1,
                2 * (Math.abs(dx * Math.cos(rad) - dy * Math.sin(rad)) - 8)
              )
            );
          } else {
            const start = toScreen(
              before,
              before.hull.engineSlots[s.index].location
            );
            e.location = toGame(p, [
              start[0] + q[0] - drag2.start[0],
              start[1] + q[1] - drag2.start[1]
            ]).map(round);
          }
        } else if (s.kind === "vertex") {
          const start = toScreen(before, [
            before.hull.bounds[s.index * 2],
            before.hull.bounds[s.index * 2 + 1]
          ]), v = toGame(p, [
            start[0] + q[0] - drag2.start[0],
            start[1] + q[1] - drag2.start[1]
          ]).map(round);
          h.bounds.splice(s.index * 2, 2, ...v);
        } else if (s.kind === "shield") {
          const start = toScreen(before, before.hull.shieldCenter);
          h.shieldCenter = toGame(p, [
            start[0] + q[0] - drag2.start[0],
            start[1] + q[1] - drag2.start[1]
          ]).map(round);
        } else {
          const c = toScreen(p, s.kind === "radius" ? h.shieldCenter : [0, 0]);
          h[s.kind === "radius" ? "shieldRadius" : "collisionRadius"] = round(
            Math.hypot(q[0] - c[0], q[1] - c[1])
          );
        }
        host.set(p);
        host.draw();
      },
      true
    );
    function end(cancel) {
      if (!drag2) return;
      const saved = drag2;
      drag2 = null;
      delete host.svg.dataset.dragKind;
      const errors = validate(host.get()).errors;
      if (cancel || errors.length) {
        host.set(saved.before);
        host.render();
        if (errors.length && !cancel)
          host.status(`Edit rejected: ${errors.join(" ")}`);
      } else if (saved.moved) host.commit();
      else host.render();
    }
    host.svg.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      host.gestures.cancel();
      const p = host.get(), q = toGame(p, screenPoint(event)).map(round);
      selection = getSelection(event.target);
      render2();
      host.draw();
      menu.replaceChildren();
      function action(title, fn) {
        const b = document.createElement("button");
        b.type = "button";
        b.role = "menuitem";
        b.textContent = title;
        b.setAttribute("aria-label", title);
        b.onclick = () => {
          menu.hidden = true;
          fn();
        };
        menu.append(b);
      }
      const heading = document.createElement("div");
      heading.className = "menu-heading";
      heading.textContent = "Active tool";
      menu.append(heading);
      for (const [value, title] of [
        ["weapons", "Weapons"],
        ["shield", "Shield"],
        ["engines", "Engines"],
        ["bounds", "Collision bounds"]
      ]) {
        action(title, () => {
          input("editTool").value = value;
          input("editTool").dispatchEvent(new Event("change"));
          host.status(`${title} tool selected. Right-click for actions.`);
        });
        const button = menu.lastElementChild;
        button.classList.add("tool-choice");
        button.dataset.tool = value;
        if (mode() === value) button.setAttribute("aria-current", "true");
      }
      const separator = document.createElement("div");
      separator.role = "separator";
      separator.className = "menu-separator";
      menu.append(separator);
      if (mode() === "engines") {
        action("Add engine here", () => {
          perform((p2) => addEngine(p2, q));
          selection = {
            kind: "engine",
            index: host.get().hull.engineSlots.length - 1
          };
          host.render();
        });
        if (selection?.kind === "engine") {
          const i = selection.index;
          action("Duplicate engine", () => {
            perform((p2) => copyEngine(p2, i));
            selection = {
              kind: "engine",
              index: host.get().hull.engineSlots.length - 1
            };
            host.render();
          });
          action("Mirror engine", () => {
            perform((p2) => copyEngine(p2, i, true));
            selection = {
              kind: "engine",
              index: host.get().hull.engineSlots.length - 1
            };
            host.render();
          });
          action("Delete engine", () => {
            selection = null;
            perform((p2) => {
              p2.hull.engineSlots.splice(i, 1);
            });
          });
        }
      }
      if (mode() === "shield") {
        action("Set shield center here", () => {
          selection = { kind: "shield" };
          perform((p2) => p2.hull.shieldCenter = q);
        });
        action("Select shield radius", () => {
          selection = { kind: "radius" };
          host.render();
        });
        action(
          p.hull.shieldRadius > 0 ? "Disable shield circle (radius 0)" : "Enable shield circle",
          () => {
            selection = { kind: "radius" };
            perform(
              (p2) => p2.hull.shieldRadius = p2.hull.shieldRadius > 0 ? 0 : Math.max(p2.hull.width, p2.hull.height) / 2
            );
          }
        );
      }
      if (mode() === "bounds") {
        if (p.hull.bounds.length)
          action("Insert vertex on nearest edge", () => {
            perform((p2) => {
              selection = { kind: "vertex", index: insertVertex(p2, q) };
            });
          });
        if (selection?.kind === "vertex") {
          const i = selection.index;
          action("Delete vertex", () => {
            selection = null;
            perform((p2) => {
              p2.hull.bounds.splice(i * 2, 2);
            });
          });
        }
        action("Select collision radius", () => {
          selection = { kind: "collision" };
          host.render();
        });
        action(
          p.hull.bounds.length ? "Replace outline with sprite rectangle\u2026" : "Create rectangle outline",
          () => {
            if (p.hull.bounds.length && !confirm(
              "Replace the collision outline with a rectangle? You can undo this."
            ))
              return;
            selection = null;
            perform(rectangleBounds);
          }
        );
        if (p.hull.bounds.length)
          action("Clear outline\u2026", () => {
            if (confirm(
              "Remove the outline? Collision radius remains. You can undo this."
            )) {
              selection = null;
              perform((p2) => p2.hull.bounds = []);
            }
          });
      }
      menu.hidden = false;
      menu.style.left = "0px";
      menu.style.top = "0px";
      const r = menu.getBoundingClientRect();
      menu.style.left = `${Math.max(0, Math.min(event.clientX, innerWidth - r.width - 8))}px`;
      menu.style.top = `${Math.max(0, Math.min(event.clientY, innerHeight - r.height - 8))}px`;
      menu.querySelector("button")?.focus();
    });
    document.addEventListener("pointerdown", (e) => {
      if (!menu.contains(e.target)) menu.hidden = true;
    });
    menu.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        menu.hidden = true;
        input("editTool").focus();
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const buttons = Array.from(menu.querySelectorAll("button")), i = buttons.indexOf(document.activeElement);
        buttons[(i + (e.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length]?.focus();
      }
    });
    input("editTool").addEventListener("change", () => {
      host.gestures.cancel();
      selection = null;
      menu.hidden = true;
      host.render();
    });
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        menu.hidden = true;
      }
    });
    $2("exportPackage").addEventListener("click", () => {
      void (async () => {
        host.gestures.finish();
        const snapshot = clone(host.get()), errors = validate(snapshot).errors;
        if (errors.length) throw Error(errors.join("\n"));
        if (!window.desktop?.exportPackage)
          throw Error("Open the desktop app to export a design package.");
        const metadata = await choosePackageMetadata(snapshot.hull.hullName, false, snapshot.hull.hullId);
        if (!metadata) {
          host.status("Package export canceled.");
          return;
        }
        const result = await window.desktop.exportPackage(
          snapshot,
          await previewPNG(snapshot),
          metadata
        );
        host.status(
          result ? `Design package exported: ${result}` : "Package export canceled."
        );
      })().catch((e) => host.status(`Package export failed: ${e}`));
    });
    return {
      draw: draw2,
      render: render2,
      reset: () => {
        selection = null;
        drag2 = null;
        menu.hidden = true;
      }
    };
  }

  // src/references.ts
  var NS2 = "http://www.w3.org/2000/svg";
  var references = [];
  function element(tag, attributes, parent) {
    const node = document.createElementNS(NS2, tag);
    for (const [key, value] of Object.entries(attributes))
      node.setAttribute(key, String(value));
    parent.append(node);
    return node;
  }
  async function loadReference() {
    const response = await fetch("assets/class-references.json");
    if (!response.ok) throw Error("Reference data unavailable");
    references = await response.json();
  }
  function drawReferences(project2) {
    const svg2 = document.getElementById(
      "scaleReferences"
    );
    svg2.replaceChildren();
    const selected2 = document.getElementById("referenceClass").value;
    const reference = references.find(
      (r) => r.hullSize === (selected2 === "AUTO" ? project2.hull.hullSize : selected2)
    );
    if (!reference) return;
    const h = project2.hull, unit = Math.min(
      240 / Math.max(h.height, reference.height),
      180 / Math.max(h.width, reference.width)
    );
    const defs = element("defs", {}, svg2), filter = element(
      "filter",
      {
        id: "reference-shadow",
        x: "0%",
        y: "0%",
        width: "100%",
        height: "100%",
        "color-interpolation-filters": "sRGB"
      },
      defs
    );
    element(
      "feColorMatrix",
      {
        type: "matrix",
        values: "0 0 0 0 0.40  0 0 0 0 0.49  0 0 0 0 0.53  0 0 0 0.8 0"
      },
      filter
    );
    const text = (x, y, value, small = false) => {
      const t = element(
        "text",
        {
          x,
          y,
          "text-anchor": "middle",
          class: small ? "referenceText muted" : "referenceText"
        },
        svg2
      );
      t.textContent = value;
    };
    const entries = [
      {
        name: h.hullName,
        width: h.width,
        height: h.height,
        image: project2.image,
        ratio: 0
      },
      {
        name: `${reference.name} \xB7 1:1`,
        width: reference.width,
        height: reference.height,
        image: reference.image,
        ratio: 1
      }
    ];
    entries.forEach((entry, i) => {
      const cx = 165 + i * 330, w = entry.width * unit, ht = entry.height * unit;
      const attrs = {
        href: entry.image,
        x: cx - w / 2,
        y: 260 - ht,
        width: w,
        height: ht,
        preserveAspectRatio: "none"
      };
      if (i === 0) attrs["data-current-ship"] = "true";
      else {
        attrs["data-reference"] = entry.ratio;
        attrs.filter = "url(#reference-shadow)";
      }
      element("image", attrs, svg2);
      text(cx, 286, entry.name);
      text(
        cx,
        305,
        `${Number(entry.width.toFixed(2))} \xD7 ${Number(entry.height.toFixed(2))} units`,
        true
      );
    });
    element(
      "line",
      { x1: 10, y1: 262, x2: 650, y2: 262, stroke: "#40525b", "stroke-width": 1 },
      svg2
    );
    document.getElementById("comparisonRatio").textContent = `Current hull length: ${(h.height / reference.height).toFixed(2)}\xD7 original ${reference.name} \xB7 width: ${(h.width / reference.width).toFixed(2)}\xD7. Based on current project dimensions, independent of canvas zoom.`;
  }

  // src/editor.ts
  installStartup(window.desktop);
  var $ = (id) => document.getElementById(id);
  var val = (id) => $(id).value;
  var set = (id, v) => {
    $(id).value = String(v);
  };
  var on = (id, fn) => $(id).addEventListener("click", () => {
    try {
      gestures.finish();
      fn();
    } catch (e) {
      status(String(e));
    }
  });
  var svg = document.getElementById("canvas");
  var NS3 = "http://www.w3.org/2000/svg";
  var gestures = new GestureController(svg);
  var project;
  var history;
  var selected = "";
  var placing = false;
  var zoom = 1;
  var dirty = false;
  var session = new DocumentSession();
  var historyRevisions = [];
  var saveInFlight = false;
  var droppedDesigns = [];
  var activeDrop = -1;
  var workspaceReady = false;
  var recoveryTimer;
  var recoveryWriter = new RecoveryWriter(
    (value) => window.desktop.workspaceWrite(value),
    (outcome) => {
      if (!outcome.ok) $("workspaceState").textContent = "Recovery failed \u2014 save projects: " + outcome.error;
      else if (!recoveryTimer) $("workspaceState").textContent = "Workspace recovery up to date";
    }
  );
  var studioUI = installStudioUI({
    selectMount(id) {
      gestures.finish();
      selected = id;
      render();
    },
    layoutChanged() {
      gestures.finish();
      requestAnimationFrame(() => project && draw());
    },
    exportState(scope) {
      const docs = scope === "all" ? droppedDesigns : [droppedDesigns[activeDrop]];
      const active = docs.filter(Boolean);
      return { names: active.map((d) => d.project.hull.hullName), mounts: active.reduce((n, d) => n + d.project.hull.weaponSlots.length, 0), errors: active.flatMap((d) => validate(d.project).errors.map((e) => d.project.hull.hullName + ": " + e)) };
    }
  });
  function newDocument(p, unsaved) {
    const owner = new DocumentSession();
    owner.load(unsaved);
    return { id: crypto.randomUUID(), project: p, dirty: owner.dirty, history: new History(p), session: owner, revisions: [owner.revision], selected: "", zoom: 1, tool: "weapons", autoAttempted: false };
  }
  function rememberDrop() {
    const d = droppedDesigns[activeDrop];
    if (!d || !project) return;
    Object.assign(d, { project, dirty: session.dirty, history, session, revisions: historyRevisions, selected, zoom, tool: val("editTool") });
  }
  function snapshotWorkspace() {
    rememberDrop();
    return { format: 1, packageSettings: packageSettings(), active: activeDrop, documents: droppedDesigns.map((d) => ({ id: d.id, project: clone(d.project), dirty: d.session.dirty, zoom: d.zoom, selected: d.selected, tool: d.tool, autoAttempted: d.autoAttempted })) };
  }
  function persistWorkspace() {
    if (!workspaceReady || !window.desktop || activeDrop < 0) return;
    clearTimeout(recoveryTimer);
    recoveryTimer = void 0;
    recoveryWriter.enqueue(snapshotWorkspace());
  }
  document.addEventListener("package-settings-changed", () => scheduleRecovery());
  function scheduleRecovery() {
    if (!workspaceReady) return;
    clearTimeout(recoveryTimer);
    $("workspaceState").textContent = "Updating workspace recovery\u2026";
    recoveryTimer = setTimeout(() => {
      recoveryTimer = void 0;
      try {
        persistWorkspace();
      } catch (error) {
        $("workspaceState").textContent = "Recovery failed \u2014 save projects: " + error;
      }
    }, 350);
  }
  function drawDropped() {
    if (project) studioUI.fileState(session.dirty);
    const panel = $("droppedPanel"), list = $("droppedDesigns");
    panel.hidden = !droppedDesigns.length;
    list.replaceChildren();
    droppedDesigns.forEach((d, i) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.dropIndex = String(i);
      button.classList.toggle("active", i === activeDrop);
      const img = document.createElement("img");
      img.src = d.project.image;
      img.alt = "";
      const label = document.createElement("span");
      label.textContent = d.project.hull.hullName + " \xB7 " + d.project.hull.hullSize + (d.session.dirty ? " *" : "");
      button.append(img, label);
      button.onclick = () => openDropped(i);
      button.oncontextmenu = (event) => {
        event.preventDefault();
        if (droppedDesigns.length === 1) {
          status("Keep at least one ship open.");
          return;
        }
        if (d.session.dirty && !confirm("Close this unsaved design? Save it first to keep a project copy.")) return;
        gestures.finish();
        rememberDrop();
        const current2 = droppedDesigns[activeDrop];
        droppedDesigns.splice(i, 1);
        activeDrop = -1;
        activateDocument(Math.max(0, droppedDesigns.indexOf(current2)));
        scheduleRecovery();
      };
      button.title = "Switch ship. Right-click to close this design.";
      list.append(button);
    });
  }
  function activateDocument(index) {
    const d = droppedDesigns[index];
    activeDrop = index;
    project = d.project;
    history = d.history;
    session = d.session;
    historyRevisions = d.revisions;
    selected = d.selected;
    zoom = d.zoom;
    dirty = session.dirty;
    set("editTool", d.tool);
    placing = false;
    geometry?.reset();
    render();
    drawDropped();
  }
  function openDropped(index) {
    if (index === activeDrop) return;
    gestures.finish();
    rememberDrop();
    activateDocument(index);
    scheduleRecovery();
    void autoOutline();
  }
  function autoOutline(d = droppedDesigns[activeDrop]) {
    if (!d) return Promise.resolve();
    if (d.outlineTask) return d.outlineTask;
    return d.outlineTask = generateAndApplyOutline(d);
  }
  async function generateAndApplyOutline(d) {
    if (d.autoAttempted || d.project.hull.bounds.length) return;
    d.autoAttempted = true;
    const owner = d.session, ticket = owner.beginSave(), image = d.project.image;
    try {
      const generated = await outlineForProject(clone(d.project));
      if (!droppedDesigns.includes(d) || owner.revision !== ticket.revision || d.project.image !== image || d.project.hull.bounds.length) return;
      if (d === droppedDesigns[activeDrop]) {
        gestures.finish();
        if (owner.revision !== ticket.revision) return;
        project.hull.bounds = generated.bounds;
        project.omittedArrays = project.omittedArrays?.filter((k) => k !== "bounds");
        commit();
      } else {
        d.project = clone(d.project);
        d.project.hull.bounds = generated.bounds;
        d.project.omittedArrays = d.project.omittedArrays?.filter((k) => k !== "bounds");
        d.revisions = d.revisions.slice(0, d.history.index + 1);
        d.history.push(d.project);
        owner.change();
        d.revisions.push(owner.revision);
        if (d.revisions.length > 80) d.revisions.shift();
        d.dirty = true;
        drawDropped();
        scheduleRecovery();
      }
      status("Automatic " + generated.result.method + " outline added (" + generated.result.points.length + " vertices). Manual editing and Undo remain available." + (generated.result.reason ? " " + generated.result.reason : ""));
    } catch (error) {
      status("Automatic outline skipped: " + error);
      scheduleRecovery();
    }
  }
  async function restoreWorkspace() {
    try {
      const result = await window.desktop?.workspaceRead();
      if (result?.workspace) {
        const saved = result.workspace;
        restorePackageSettings(saved.packageSettings);
        for (const d of saved.documents) {
          const doc = newDocument(d.project, d.dirty);
          Object.assign(doc, { id: d.id, zoom: d.zoom, selected: d.selected, tool: d.tool, autoAttempted: d.autoAttempted });
          droppedDesigns.push(doc);
        }
        activateDocument(saved.active);
        workspaceReady = true;
        $("workspaceState").textContent = "Workspace recovery up to date";
        status("Restored " + droppedDesigns.length + " designs, including unsaved drafts. Undo starts fresh after reopening." + (result.warning ? " " + result.warning : ""));
        for (const d of droppedDesigns) void autoOutline(d);
        return;
      }
      await example();
      workspaceReady = true;
      if (result?.warning) status(result.warning);
      scheduleRecovery();
    } catch (error) {
      await example();
      workspaceReady = true;
      status("Workspace could not be restored: " + error);
    }
  }
  var allowClose = false;
  var closeBusy = false;
  var closeDialog = $("closeDialog");
  window.desktop?.onPrepareClose(() => {
    if (closeBusy) return;
    if (closeDialog.open) {
      $("closeKeepEditing").focus();
      return;
    }
    if (!workspaceReady) {
      status("Workspace is still loading. Try closing again when loading finishes.");
      return;
    }
    gestures.finish();
    rememberDrop();
    const unsaved = droppedDesigns.filter((d) => d.session.dirty).length;
    $("closeDescription").textContent = unsaved ? `${unsaved} design${unsaved === 1 ? " has" : "s have"} unsaved changes. Choose what to keep for next time.` : "Choose whether to restore your open designs next time.";
    $("closeError").hidden = true;
    closeDialog.showModal();
    $("closeKeepEditing").focus();
  });
  function keepEditing() {
    if (!closeBusy) closeDialog.close();
  }
  $("closeKeepEditing").onclick = keepEditing;
  closeDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    keepEditing();
  });
  async function finishClose(mode) {
    if (closeBusy) return;
    if (saveInFlight || batchInFlight) {
      $("closeError").hidden = false;
      $("closeError").textContent = "Wait for the current save or export to finish, then try again.";
      return;
    }
    closeBusy = true;
    for (const id of ["closeKeepEditing", "closeRecover", "closeAll"]) $(id).disabled = true;
    const wasReady = workspaceReady;
    try {
      gestures.finish();
      rememberDrop();
      if (mode === "recover") {
        persistWorkspace();
        await recoveryWriter.flush();
      }
      workspaceReady = false;
      clearTimeout(recoveryTimer);
      recoveryTimer = void 0;
      await recoveryWriter.flush().catch(() => {
      });
      await window.desktop.prepareExit(mode);
      allowClose = true;
      window.desktop.closeReady();
    } catch (error) {
      workspaceReady = wasReady;
      allowClose = false;
      closeBusy = false;
      $("closeError").hidden = false;
      $("closeError").textContent = "Could not close: " + error + ". Your designs are still open.";
      for (const id of ["closeKeepEditing", "closeRecover", "closeAll"]) $(id).disabled = false;
    }
  }
  $("closeRecover").onclick = () => void finishClose("recover");
  $("closeAll").onclick = () => void finishClose("discard");
  async function dropPNGs(files) {
    try {
      gestures.finish();
      rememberDrop();
      const ticket = session.beginLoad();
      const bytes = droppedDesigns.reduce((sum, d) => sum + Math.floor(d.project.image.length * 3 / 4), 0) + files.reduce((sum, f) => sum + f.size, 0);
      if (bytes > DROP_BYTES) throw Error("Dropped design shelf limit is 80 MB; save and reopen a fresh window.");
      const batch = await preparePNGDrop(files, droppedDesigns.map((d) => d.project.hull.hullId), () => session.accepts(ticket));
      if (!batch.length || !session.accepts(ticket)) return;
      if (activeDrop < 0 && !mayReplace()) return;
      if (!session.accepts(ticket)) return;
      const first = droppedDesigns.length;
      droppedDesigns.push(...batch.map((project2) => newDocument(project2, true)));
      openDropped(first);
      await Promise.all(droppedDesigns.slice(first).map((d) => autoOutline(d)));
      status(`${batch.length} PNG${batch.length === 1 ? "" : "s"} dropped. Select a design above; edits stay with each draft. Class suffixes set starting sizes.`);
    } catch (error) {
      status(`Drop failed: ${error}`);
    }
  }
  var colors = {
    ENERGY: "#32b8f4",
    BALLISTIC: "#edb56b",
    MISSILE: "#ed7777",
    SYNERGY: "#be86dd",
    HYBRID: "#72d9b6",
    COMPOSITE: "#e3ba87",
    UNIVERSAL: "#e4d65b",
    DECORATIVE: "#9babb3",
    BUILT_IN: "#c4c4c4"
  };
  function status(s) {
    $("status").textContent = s;
  }
  function current() {
    return project.hull.weaponSlots.find((s) => s.id === selected);
  }
  function commit() {
    historyRevisions = historyRevisions.slice(0, history.index + 1);
    history.push(project);
    session.change();
    historyRevisions.push(session.revision);
    if (historyRevisions.length > 80) historyRevisions.shift();
    dirty = session.dirty;
    render();
  }
  function el(tag, attrs, parent = svg) {
    const e = document.createElementNS(NS3, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
    parent.append(e);
    return e;
  }
  function point2(event) {
    const matrix = svg.getScreenCTM();
    if (!matrix) return [0, 0];
    const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(
      matrix.inverse()
    );
    return [p.x, p.y];
  }
  function polar(origin, deg, r) {
    const rad = deg * Math.PI / 180;
    return [origin[0] - Math.sin(rad) * r, origin[1] - Math.cos(rad) * r];
  }
  function draw() {
    if (!project) return;
    svg.replaceChildren();
    const h = project.hull;
    const margin = 38;
    const w = (h.width + margin * 2) / zoom, ht = (h.height + margin * 2) / zoom;
    svg.setAttribute(
      "viewBox",
      `${h.width / 2 - w / 2} ${h.height / 2 - ht / 2} ${w} ${ht}`
    );
    el("image", {
      href: project.image,
      x: 0,
      y: 0,
      width: h.width,
      height: h.height,
      preserveAspectRatio: "none"
    });
    el("line", {
      x1: h.center[0],
      y1: -20,
      x2: h.center[0],
      y2: h.height + 20,
      stroke: "#76968c",
      "stroke-width": 0.5,
      "stroke-dasharray": "3 4",
      "pointer-events": "none"
    });
    const s = current();
    if (s && val("editTool") === "weapons") {
      const p = toScreen(project, s.locations), r = 48;
      const a = polar(p, s.angle - s.arc / 2, r), b = polar(p, s.angle + s.arc / 2, r);
      if (s.arc >= 359.99)
        el("circle", {
          cx: p[0],
          cy: p[1],
          r,
          fill: "#69b8e51a",
          stroke: "#69b8e5",
          "stroke-width": 0.7,
          "pointer-events": "none"
        });
      else
        el("path", {
          d: `M ${p} L ${a} A ${r} ${r} 0 ${s.arc > 180 ? 1 : 0} 0 ${b} Z`,
          fill: "#69b8e51a",
          stroke: "#69b8e5",
          "stroke-width": 0.7,
          "pointer-events": "none"
        });
      for (const [kind, deg, col] of [
        ["aim", s.angle, "#65caff"],
        ["arc", s.angle + s.arc / 2, "#ffce70"]
      ]) {
        const q = polar(p, deg, r);
        el("line", {
          x1: p[0],
          y1: p[1],
          x2: q[0],
          y2: q[1],
          stroke: col,
          "stroke-width": 0.7,
          "pointer-events": "none"
        });
        el("circle", {
          cx: q[0],
          cy: q[1],
          r: 3,
          fill: col,
          "data-handle": kind,
          class: "arc-handle"
        });
      }
    }
    for (const slot of h.weaponSlots)
      for (const [positionIndex, position] of slotPoints(
        slot.locations
      ).entries()) {
        const [x, y] = toScreen(project, position), r = slot.size === "LARGE" ? 6 : slot.size === "MEDIUM" ? 4.5 : 3;
        const g = el("g", {
          "data-slot": slot.id,
          "data-position": positionIndex,
          class: "weapon-marker"
        });
        el(
          slot.mount === "HARDPOINT" ? "rect" : "circle",
          slot.mount === "HARDPOINT" ? {
            x: x - r,
            y: y - r,
            width: r * 2,
            height: r * 2,
            rx: 1,
            fill: "#111c23",
            stroke: colors[slot.type] || "#aaa",
            "stroke-width": selected === slot.id ? 1.8 : 0.9
          } : {
            cx: x,
            cy: y,
            r,
            fill: "#111c23",
            stroke: colors[slot.type] || "#aaa",
            "stroke-width": selected === slot.id ? 1.8 : 0.9
          },
          g
        );
        const tip = polar([x, y], slot.angle, r + 3);
        el(
          "line",
          {
            x1: x,
            y1: y,
            x2: tip[0],
            y2: tip[1],
            stroke: colors[slot.type],
            "stroke-width": 0.7
          },
          g
        );
        if ($("showLabels").checked || slot.id === selected) {
          const t = el("text", { x: x + r + 2, y: y + 1.5 }, g);
          t.textContent = slot.id;
        }
      }
    geometry?.draw();
    $("zoomLabel").textContent = `${Math.round(zoom * 100)}%`;
    drawReferences(project);
  }
  function render() {
    rememberDrop();
    drawDropped();
    scheduleRecovery();
    const h = project.hull;
    set("name", h.hullName);
    set("hullId", h.hullId);
    set("class", h.hullSize);
    set("spritePath", h.spriteName);
    $("count").textContent = String(h.weaponSlots.length);
    $("dimensions").textContent = `${h.width.toFixed(0)} \xD7 ${h.height.toFixed(0)} units`;
    $("mountList").replaceChildren();
    for (const s2 of h.weaponSlots) {
      const b = document.createElement("button");
      b.textContent = s2.id;
      b.className = s2.id === selected ? "active" : "";
      b.type = "button";
      b.dataset.mountId = s2.id;
      b.setAttribute("aria-pressed", String(s2.id === selected));
      const small = document.createElement("small");
      small.textContent = `${s2.size} \xB7 ${s2.type}`;
      b.append(small);
      b.onclick = () => {
        selected = s2.id;
        render();
      };
      $("mountList").append(b);
    }
    studioUI.refresh(project, selected, session.dirty);
    const s = current();
    $("properties").hidden = !s;
    $("empty").hidden = !!s;
    if (s) {
      for (const [id, value] of Object.entries({
        slotId: s.id,
        forward: s.locations[0],
        port: s.locations[1],
        slotCategory: s.type,
        slotSize: s.size,
        slotMount: s.mount,
        angle: s.angle,
        arc: s.arc
      }))
        set(id, value);
    }
    geometry?.render();
    const checks = validate(project);
    $("checks").replaceChildren();
    for (const [text, cls] of [
      ...checks.errors.map((x) => [x, "error"]),
      ...checks.warnings.map((x) => [x, "warning"])
    ]) {
      const p = document.createElement("div");
      p.className = cls;
      p.textContent = text;
      $("checks").append(p);
    }
    if (!checks.errors.length && !checks.warnings.length)
      $("checks").textContent = "\u2713 Layout checks passed";
    $("export").disabled = !!checks.errors.length;
    $("undo").disabled = history.index === 0;
    $("redo").disabled = history.index === history.items.length - 1;
    draw();
  }
  function load(p, unsaved = false) {
    gestures.finish();
    rememberDrop();
    if (droppedDesigns.length >= 16) throw Error("Workspace limit is 16 ships. Right-click a design to close it first.");
    droppedDesigns.push(newDocument(p, unsaved));
    activateDocument(droppedDesigns.length - 1);
    status("Loaded " + p.hull.hullName + " \xB7 " + p.hull.weaponSlots.length + " mounts");
    void autoOutline();
    scheduleRecovery();
  }
  function mayReplace() {
    gestures.finish();
    return true;
  }
  async function example() {
    try {
      if (project && !mayReplace()) return;
      const ticket = session.beginLoad();
      const hull = await (await fetch("assets/verdant.ship")).json();
      const blob = await (await fetch("assets/verdant.png")).blob();
      const p = fromShip(hull, await dataURL(blob));
      if (session.accepts(ticket)) load(p);
    } catch (e) {
      status(`Could not load example: ${e}`);
    }
  }
  function dataURL(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(Error("Unable to read file"));
      r.readAsDataURL(blob);
    });
  }
  async function readFile(file) {
    try {
      if (!mayReplace()) return;
      const ticket = session.beginLoad();
      const originalImage = project.image;
      if (file.size > 4e7) throw Error("File limit is 40 MB.");
      if (file.name.toLowerCase().endsWith(".png")) {
        const data = await dataURL(file);
        const image = new Image();
        image.src = data;
        await image.decode();
        if (image.width > 16384 || image.height > 16384)
          throw Error("Maximum image dimension is 16384 pixels.");
        const id = file.name.replace(/\.png$/i, "").replace(/[^a-zA-Z0-9_-]/g, "_") || "new_ship";
        if (!session.accepts(ticket)) return;
        load(
          fromShip(
            {
              hullId: id,
              hullName: "New ship",
              hullSize: "DESTROYER",
              style: "HIGH_TECH",
              width: image.width,
              height: image.height,
              center: [image.width / 2, image.height / 2],
              spriteName: `graphics/ships/${id}.png`,
              collisionRadius: Math.min(image.width, image.height) / 2,
              shieldCenter: [0, 0],
              shieldRadius: Math.max(image.width, image.height) / 2,
              bounds: [],
              weaponSlots: [],
              engineSlots: []
            },
            data
          ),
          true
        );
        status("PNG loaded. Place mounts; artwork should face upward.");
      } else if (file.name.toLowerCase().endsWith(".ship")) {
        const p = fromShip(JSON.parse(await file.text()), originalImage);
        const result = validate(p);
        if (result.errors.length) throw Error(result.errors.join(" "));
        if (session.accepts(ticket)) {
          load(p, true);
          status("Layout imported onto the current sprite.");
        }
      } else {
        const p = parseProject(await file.text());
        const img = new Image();
        img.src = p.image;
        await img.decode();
        if (session.accepts(ticket)) load(p);
      }
    } catch (e) {
      status(`Import failed: ${e}`);
    }
  }
  function pick(accept) {
    const input = $("fileInput");
    input.accept = accept;
    input.value = "";
    input.onchange = () => {
      if (input.files?.[0]) void readFile(input.files[0]);
    };
    input.click();
  }
  async function save(name, text) {
    if (window.desktop) return window.desktop.save(name, text);
    const url = URL.createObjectURL(
      new Blob([text], { type: "application/json" })
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1e3);
    return true;
  }
  on("save", () => {
    if (saveInFlight) return;
    saveInFlight = true;
    $("save").disabled = true;
    const owner = session, document2 = droppedDesigns[activeDrop], ticket = owner.beginSave(), snapshot = clone(project);
    void save(
      `${snapshot.hull.hullId}.shipwright.json`,
      JSON.stringify(snapshot, null, 2)
    ).then((ok) => {
      if (ok) {
        owner.finishSave(ticket);
        if (owner === session) dirty = session.dirty;
        document2.dirty = owner.dirty;
        rememberDrop();
        drawDropped();
        scheduleRecovery();
        status(
          dirty ? "Saved earlier revision; current edits remain unsaved." : "Project saved with embedded sprite."
        );
      }
    }).catch((e) => status(String(e))).finally(() => {
      saveInFlight = false;
      $("save").disabled = false;
    });
  });
  var batchInFlight = false;
  async function batchAction(mode) {
    if (batchInFlight) return;
    if (!window.desktop) {
      status("Batch actions require the desktop app.");
      return;
    }
    batchInFlight = true;
    gestures.finish();
    await Promise.all(droppedDesigns.map((d) => autoOutline(d)));
    rememberDrop();
    for (const id of ["saveAll", "exportAll", "exportShipsAll"]) $(id).disabled = true;
    const entries = droppedDesigns.map((d) => ({ d, ticket: d.session.beginSave(), project: clone(d.project) }));
    try {
      for (const entry of entries) {
        const errors = validate(entry.project).errors;
        if (errors.length) throw Error(entry.project.hull.hullName + ": " + errors.join(" "));
      }
      const metadata = mode === "package" ? await choosePackageMetadata("Shipwright design pack", true) : void 0;
      if (metadata === false) {
        status("Package export canceled.");
        return;
      }
      const payload = [];
      for (const entry of entries) payload.push({ id: entry.d.id, project: entry.project, ...mode === "package" ? { preview: await previewPNG(entry.project) } : {} });
      const result = await window.desktop.batch(payload, mode, metadata);
      if (!result) {
        status("Batch cancelled; nothing marked saved.");
        return;
      }
      if (mode === "save") {
        for (const r of result.results) if (r.ok) {
          const entry = entries.find((e) => e.d.id === r.id);
          entry.d.session.finishSave(entry.ticket);
          entry.d.dirty = entry.d.session.dirty;
        }
      }
      dirty = session.dirty;
      rememberDrop();
      drawDropped();
      scheduleRecovery();
      const failed = result.results.filter((r) => !r.ok);
      $("batchReport").hidden = false;
      $("batchReport").textContent = result.results.filter((r) => r.ok).length + " " + (mode === "save" ? "saved" : mode === "package" ? "ships combined into one package" : "exported") + ", " + failed.length + " failed. " + result.directory + (failed.length ? " \u2014 " + failed.map((r) => r.hullId + ": " + r.error).join("; ") : "");
      status($("batchReport").textContent);
    } catch (error) {
      status("Batch failed: " + error);
    } finally {
      batchInFlight = false;
      for (const id of ["saveAll", "exportAll", "exportShipsAll"]) $(id).disabled = false;
    }
  }
  on("saveAll", () => void batchAction("save"));
  on("exportAll", () => void batchAction("package"));
  on("exportShipsAll", () => void batchAction("ship"));
  on("export", () => {
    const hull = toShip(project);
    void save(`${hull.hullId}.ship`, JSON.stringify(hull, null, 2)).then((ok) => {
      if (ok)
        status("Layout exported. Keep the PNG at the specified sprite path.");
    }).catch((e) => status(String(e)));
  });
  on("example", () => void example());
  on("imageOpen", () => pick(".png"));
  on("projectOpen", () => pick(".json"));
  on("importShip", () => pick(".ship"));
  for (const id of ["category", "slotCategory"])
    for (const c of categories) {
      const o = document.createElement("option");
      o.value = c;
      o.textContent = c;
      $(id).append(o);
    }
  for (const [id, key] of [
    ["name", "hullName"],
    ["hullId", "hullId"],
    ["class", "hullSize"],
    ["spritePath", "spriteName"]
  ])
    $(id).addEventListener("change", () => {
      const value = val(id);
      gestures.finish();
      project.hull[key] = value;
      commit();
    });
  for (const id of [
    "slotId",
    "forward",
    "port",
    "slotCategory",
    "slotSize",
    "slotMount",
    "angle",
    "arc"
  ])
    $(id).addEventListener("change", () => {
      const s = current();
      if (!s) return;
      const idValue = val("slotId");
      if (!idValue || project.hull.weaponSlots.some((x) => x !== s && x.id === idValue)) {
        status("Choose a unique, nonempty mount ID.");
        render();
        return;
      }
      const numbers = ["forward", "port", "angle", "arc"].map(
        (x) => Number(val(x))
      );
      if (!numbers.every(Number.isFinite) || numbers[3] < 0 || numbers[3] > 360) {
        status("Use finite numbers and an arc between 0 and 360.");
        render();
        return;
      }
      const properties = {
        id: idValue,
        locations: moveSlot(s.locations, [numbers[0], numbers[1]]),
        angle: numbers[2],
        arc: numbers[3],
        type: val("slotCategory"),
        size: val("slotSize"),
        mount: val("slotMount")
      };
      gestures.finish();
      Object.assign(s, properties);
      selected = s.id;
      commit();
    });
  on("resize", () => {
    const factor = Number(val("scale"));
    if (factor <= 0 || factor > 10 || project.hull.width * factor > 16384 || project.hull.height * factor > 16384)
      throw Error(
        "Choose a scale greater than 0, at most 10, within 16384 units."
      );
    resize(project, factor);
    commit();
    status("Scaled hull, mounts, engines, shield and outline together.");
  });
  function placement() {
    placing = !placing;
    $("add").classList.toggle("active", placing);
    $("mode").textContent = placing ? "CLICK TO PLACE" : "SELECT & MOVE";
  }
  on("add", placement);
  on("mirror", () => {
    const s = current();
    if (s) {
      const m = mirror(project, s);
      project.hull.weaponSlots.push(m);
      selected = m.id;
      commit();
    }
  });
  on("delete", () => {
    project.hull.weaponSlots = project.hull.weaponSlots.filter(
      (x) => x.id !== selected
    );
    selected = "";
    commit();
  });
  function undo() {
    gestures.finish();
    const p = history.undo();
    if (p) {
      project = p;
      session.restore(historyRevisions[history.index]);
      dirty = session.dirty;
      geometry.reset();
      render();
    }
  }
  function redo() {
    gestures.finish();
    const p = history.redo();
    if (p) {
      project = p;
      session.restore(historyRevisions[history.index]);
      dirty = session.dirty;
      geometry.reset();
      render();
    }
  }
  on("undo", undo);
  on("redo", redo);
  on("zoomIn", () => {
    zoom = Math.min(8, zoom * 1.25);
    scheduleRecovery();
    draw();
  });
  on("zoomOut", () => {
    zoom = Math.max(0.25, zoom / 1.25);
    scheduleRecovery();
    draw();
  });
  on("fit", () => {
    zoom = 1;
    scheduleRecovery();
    draw();
  });
  for (const id of ["showBounds", "showShield", "showLabels"])
    $(id).addEventListener("change", draw);
  var drag = null;
  svg.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    gestures.cancel();
    session.generation++;
    const target = e.target;
    const handle = target.closest("[data-handle]")?.getAttribute("data-handle");
    const slotId = target.closest("[data-slot]")?.getAttribute("data-slot");
    if (handle && current()) {
      drag = {
        kind: handle,
        id: selected,
        start: point2(e),
        original: clone(current().locations),
        before: clone(project),
        moved: false
      };
      gestures.begin(e.pointerId, endWeapon);
      return;
    }
    if (slotId) {
      selected = slotId;
      render();
      drag = {
        kind: "move",
        id: slotId,
        start: point2(e),
        original: clone(current().locations),
        before: clone(project),
        moved: false
      };
      gestures.begin(e.pointerId, endWeapon);
      return;
    }
    if (placing) {
      const location = toGame(project, point2(e)).map(
        (x) => Math.round(x * 10) / 10
      );
      const s = {
        id: nextId(project),
        locations: location,
        type: val("category"),
        size: val("size"),
        mount: val("mount"),
        angle: 0,
        arc: val("mount") === "HARDPOINT" ? 10 : 240
      };
      project.hull.weaponSlots.push(s);
      if ($("symmetric").checked && Math.abs(location[1]) > 0.1)
        project.hull.weaponSlots.push(mirror(project, s));
      selected = s.id;
      commit();
    } else {
      selected = "";
      render();
    }
  });
  svg.addEventListener("pointermove", (e) => {
    if (!drag || !gestures.owns(e.pointerId)) return;
    const s = project.hull.weaponSlots.find((x) => x.id === drag.id);
    if (!s) return;
    const q = point2(e);
    drag.moved = true;
    if (drag.kind === "move") {
      const origin = toScreen(project, drag.original);
      s.locations = moveSlot(
        drag.original,
        toGame(project, [
          origin[0] + q[0] - drag.start[0],
          origin[1] + q[1] - drag.start[1]
        ]).map((x) => Math.round(x * 10) / 10)
      );
    } else {
      const p = toScreen(project, s.locations);
      const angle = Math.atan2(p[0] - q[0], p[1] - q[1]) * 180 / Math.PI;
      if (drag.kind === "aim") s.angle = Math.round(angle);
      else {
        s.arc = Math.min(
          360,
          Math.round(2 * Math.abs((angle - s.angle + 540) % 360 - 180))
        );
      }
    }
    draw();
  });
  function endWeapon(cancel) {
    const saved = drag;
    drag = null;
    if (!saved) return;
    if (cancel) {
      project = saved.before;
      render();
    } else if (saved.moved) commit();
    else render();
  }
  svg.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      zoom = Math.max(0.25, Math.min(8, zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1)));
      scheduleRecovery();
      draw();
    },
    { passive: false }
  );
  window.addEventListener("keydown", (e) => {
    if (e.target.matches("input,select,textarea")) return;
    if (e.ctrlKey && e.key.toLowerCase() === "z") {
      e.preventDefault();
      e.shiftKey ? redo() : undo();
    }
    if (e.ctrlKey && e.key.toLowerCase() === "y") {
      e.preventDefault();
      redo();
    }
    if (e.key === "Escape" && placing) placement();
  });
  window.addEventListener("beforeunload", (e) => {
    if (allowClose) return;
    gestures.finish();
    rememberDrop();
    if (dirty || droppedDesigns.some((d) => d.dirty)) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
  window.addEventListener("dragover", (event) => {
    event.preventDefault();
    if (event.dataTransfer?.types.includes("Files")) {
      event.dataTransfer.dropEffect = "copy";
      document.body.classList.add("file-drag");
    }
  });
  window.addEventListener("dragleave", (event) => {
    if (!event.relatedTarget) document.body.classList.remove("file-drag");
  });
  window.addEventListener("drop", (event) => {
    event.preventDefault();
    document.body.classList.remove("file-drag");
    const files = Array.from(event.dataTransfer?.files || []);
    if (!files.length) return;
    if (files.every((f) => f.name.toLowerCase().endsWith(".png"))) void dropPNGs(files);
    else if (files.length === 1 && /\.(ship|json)$/i.test(files[0].name)) void readFile(files[0]);
    else status("Drop failed: drop a PNG batch, or one .ship / .shipwright.json file.");
  });
  void restoreWorkspace();
  new ResizeObserver(() => {
    if (project) drawReferences(project);
  }).observe($("viewport"));
  void loadReference().then(() => {
    if (project) draw();
  }).catch(
    () => status("Class references unavailable; ship editing is unaffected.")
  );
  on("compareScale", () => {
    drawReferences(project);
    $("comparisonDialog").showModal();
  });
  on("closeComparison", () => $("comparisonDialog").close());
  $("referenceClass").addEventListener("change", () => drawReferences(project));
  var geometry = installGeometry({
    svg,
    gestures,
    get: () => project,
    set: (p) => {
      project = p;
    },
    commit,
    draw,
    render,
    status,
    save,
    invalidate: () => {
      session.generation++;
    }
  });
  installShipLibrary({
    mayReplace,
    begin: () => session.beginLoad(),
    accepts: (t) => session.accepts(t),
    open: (p) => {
      load(p, true);
      status(
        `Opened editable copy: ${p.hull.hullName}. Save your project to keep edits.`
      );
    }
  });
})();
