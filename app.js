"use strict";
(() => {
  // src/core.ts
  var categories = ["ENERGY", "BALLISTIC", "MISSILE", "SYNERGY", "HYBRID", "COMPOSITE", "UNIVERSAL", "DECORATIVE", "BUILT_IN"];
  var sizes = ["SMALL", "MEDIUM", "LARGE"];
  var clone = (x) => JSON.parse(JSON.stringify(x));
  function fromShip(hull, image) {
    return { version: 1, image, hull: clone(hull) };
  }
  function toScreen(p, [f, l]) {
    return [p.hull.center[0] - l, p.hull.height - p.hull.center[1] - f];
  }
  function toGame(p, [x, y]) {
    return [p.hull.height - p.hull.center[1] - y, p.hull.center[0] - x];
  }
  function nextId(p) {
    let n = 1;
    while (p.hull.weaponSlots.some((s) => s.id === `W${String(n).padStart(3, "0")}`)) n++;
    return `W${String(n).padStart(3, "0")}`;
  }
  function mirror(p, s) {
    return { ...clone(s), id: nextId(p), locations: [s.locations[0], -s.locations[1]], angle: -s.angle };
  }
  var point = (x) => Array.isArray(x) && x.length === 2 && x.every(Number.isFinite);
  function validate(p) {
    const errors = [], warnings = [];
    const h = p?.hull;
    if (p?.version !== 1 || !h) return { errors: ["Unsupported or missing project version/hull."], warnings };
    if (typeof p.image !== "string" || !p.image.startsWith("data:image/png;base64,")) errors.push("A PNG sprite is required.");
    if (!/^[a-zA-Z0-9_-]+$/.test(h.hullId)) errors.push("Hull ID must use letters, numbers, underscores or dashes.");
    if (!["FRIGATE", "DESTROYER", "CRUISER", "CAPITAL_SHIP", "FIGHTER"].includes(h.hullSize)) errors.push("Invalid hull class.");
    if (![h.width, h.height].every((n) => Number.isFinite(n) && n > 0 && n <= 16384) || !point(h.center)) errors.push("Invalid hull dimensions or centre.");
    if (typeof h.spriteName !== "string" || !/^graphics\/ships\/[a-zA-Z0-9_/-]+\.png$/.test(h.spriteName) || h.spriteName.includes("..")) errors.push("Sprite path must be a safe graphics/ships/*.png path.");
    if (!Array.isArray(h.weaponSlots)) return { errors: [...errors, "Missing weapon slots."], warnings };
    const ids = /* @__PURE__ */ new Set();
    for (const s of h.weaponSlots) {
      if (!s || typeof s !== "object") {
        errors.push("Invalid mount.");
        continue;
      }
      if (typeof s.id !== "string" || !s.id || ids.has(s.id)) errors.push("Mount IDs must be nonempty and unique.");
      ids.add(s.id);
      if (!point(s.locations) || !Number.isFinite(s.angle) || !Number.isFinite(s.arc) || s.arc < 0 || s.arc > 360) errors.push(`${s.id}: invalid coordinates, angle or arc.`);
      if (!categories.includes(s.type) || !sizes.includes(s.size) || !["TURRET", "HARDPOINT", "HIDDEN"].includes(s.mount)) errors.push(`${s.id}: invalid mount type or size.`);
      if (point(s.locations) && point(h.center)) {
        const [x, y] = toScreen(p, s.locations);
        if (x < 0 || y < 0 || x > h.width || y > h.height) warnings.push(`${s.id} is outside the sprite rectangle.`);
      }
    }
    if (!point(h.shieldCenter) || !Number.isFinite(h.shieldRadius) || h.shieldRadius < 0 || !Number.isFinite(h.collisionRadius) || h.collisionRadius < 0) errors.push("Invalid shield or collision geometry.");
    if (!Array.isArray(h.bounds) || h.bounds.length % 2 !== 0 || !h.bounds.every(Number.isFinite)) errors.push("Invalid collision outline.");
    if (!Array.isArray(h.engineSlots) || h.engineSlots.some((e) => !point(e.location) || ![e.angle, e.width, e.length].every(Number.isFinite))) errors.push("Invalid engines.");
    return { errors, warnings };
  }
  function toShip(p) {
    const v = validate(p);
    if (v.errors.length) throw Error(v.errors.join("\n"));
    return clone(p.hull);
  }
  function parseProject(text) {
    const p = JSON.parse(text);
    const v = validate(p);
    if (v.errors.length) throw Error(v.errors.join("\n"));
    return p;
  }
  function resize(p, f) {
    if (!Number.isFinite(f) || f <= 0) throw Error("Scale must be positive.");
    const h = p.hull;
    h.width *= f;
    h.height *= f;
    h.center = h.center.map((n) => n * f);
    h.shieldCenter = h.shieldCenter.map((n) => n * f);
    h.shieldRadius *= f;
    h.collisionRadius *= f;
    h.bounds = h.bounds.map((n) => n * f);
    for (const s of h.weaponSlots) s.locations = s.locations.map((n) => n * f);
    for (const e of h.engineSlots) {
      e.location = e.location.map((n) => n * f);
      for (const k of ["width", "length", "contrailSize"]) if (typeof e[k] === "number") e[k] *= f;
    }
  }
  var History = class {
    items;
    index = 0;
    constructor(p) {
      this.items = [clone(p)];
    }
    push(p) {
      this.items = this.items.slice(0, this.index + 1);
      this.items.push(clone(p));
      if (this.items.length > 80) this.items.shift();
      this.index = this.items.length - 1;
    }
    undo() {
      return this.index > 0 ? clone(this.items[--this.index]) : null;
    }
    redo() {
      return this.index < this.items.length - 1 ? clone(this.items[++this.index]) : null;
    }
  };

  // src/editor.ts
  var $ = (id) => document.getElementById(id);
  var val = (id) => $(id).value;
  var set = (id, v) => {
    $(id).value = String(v);
  };
  var on = (id, fn) => $(id).addEventListener("click", () => {
    try {
      fn();
    } catch (e) {
      status(String(e));
    }
  });
  var svg = document.getElementById("canvas");
  var NS = "http://www.w3.org/2000/svg";
  var project;
  var history;
  var selected = "";
  var placing = false;
  var zoom = 1;
  var dirty = false;
  var colors = { ENERGY: "#32b8f4", BALLISTIC: "#edb56b", MISSILE: "#ed7777", SYNERGY: "#be86dd", HYBRID: "#72d9b6", COMPOSITE: "#e3ba87", UNIVERSAL: "#e4d65b", DECORATIVE: "#9babb3", BUILT_IN: "#c4c4c4" };
  function status(s) {
    $("status").textContent = s;
  }
  function current() {
    return project.hull.weaponSlots.find((s) => s.id === selected);
  }
  function commit() {
    history.push(project);
    dirty = true;
    render();
  }
  function el(tag, attrs, parent = svg) {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
    parent.append(e);
    return e;
  }
  function point2(event) {
    const matrix = svg.getScreenCTM();
    if (!matrix) return [0, 0];
    const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
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
    svg.setAttribute("viewBox", `${h.width / 2 - w / 2} ${h.height / 2 - ht / 2} ${w} ${ht}`);
    el("image", { href: project.image, x: 0, y: 0, width: h.width, height: h.height, preserveAspectRatio: "none" });
    el("line", { x1: h.center[0], y1: -20, x2: h.center[0], y2: h.height + 20, stroke: "#76968c", "stroke-width": 0.5, "stroke-dasharray": "3 4", "pointer-events": "none" });
    if ($("showBounds").checked) {
      const points = [];
      for (let i = 0; i < h.bounds.length; i += 2) points.push(toScreen(project, [h.bounds[i], h.bounds[i + 1]]).join(","));
      el("polygon", { points: points.join(" "), fill: "none", stroke: "#739d7f", "stroke-width": 0.6, "pointer-events": "none" });
      for (const e of h.engineSlots) {
        const p = toScreen(project, e.location);
        el("circle", { cx: p[0], cy: p[1], r: 3, fill: "#fa9b5d", "pointer-events": "none" });
      }
    }
    if ($("showShield").checked) {
      const p = toScreen(project, h.shieldCenter);
      el("circle", { cx: p[0], cy: p[1], r: h.shieldRadius, fill: "none", stroke: "#6aafd8", "stroke-width": 0.7, "stroke-dasharray": "4 3", "pointer-events": "none" });
    }
    const s = current();
    if (s) {
      const p = toScreen(project, s.locations), r = 48;
      const a = polar(p, s.angle - s.arc / 2, r), b = polar(p, s.angle + s.arc / 2, r);
      if (s.arc >= 359.99) el("circle", { cx: p[0], cy: p[1], r, fill: "#69b8e51a", stroke: "#69b8e5", "stroke-width": 0.7, "pointer-events": "none" });
      else el("path", { d: `M ${p} L ${a} A ${r} ${r} 0 ${s.arc > 180 ? 1 : 0} 0 ${b} Z`, fill: "#69b8e51a", stroke: "#69b8e5", "stroke-width": 0.7, "pointer-events": "none" });
      for (const [kind, deg, col] of [["aim", s.angle, "#65caff"], ["arc", s.angle + s.arc / 2, "#ffce70"]]) {
        const q = polar(p, deg, r);
        el("line", { x1: p[0], y1: p[1], x2: q[0], y2: q[1], stroke: col, "stroke-width": 0.7, "pointer-events": "none" });
        el("circle", { cx: q[0], cy: q[1], r: 3, fill: col, "data-handle": kind, class: "arc-handle" });
      }
    }
    for (const slot of h.weaponSlots) {
      const [x, y] = toScreen(project, slot.locations), r = slot.size === "LARGE" ? 6 : slot.size === "MEDIUM" ? 4.5 : 3;
      const g = el("g", { "data-slot": slot.id, class: "weapon-marker" });
      el(slot.mount === "HARDPOINT" ? "rect" : "circle", slot.mount === "HARDPOINT" ? { x: x - r, y: y - r, width: r * 2, height: r * 2, rx: 1, fill: "#111c23", stroke: colors[slot.type] || "#aaa", "stroke-width": selected === slot.id ? 1.8 : 0.9 } : { cx: x, cy: y, r, fill: "#111c23", stroke: colors[slot.type] || "#aaa", "stroke-width": selected === slot.id ? 1.8 : 0.9 }, g);
      const tip = polar([x, y], slot.angle, r + 3);
      el("line", { x1: x, y1: y, x2: tip[0], y2: tip[1], stroke: colors[slot.type], "stroke-width": 0.7 }, g);
      if ($("showLabels").checked) {
        const t = el("text", { x: x + r + 2, y: y + 1.5 }, g);
        t.textContent = slot.id;
      }
    }
    $("zoomLabel").textContent = `${Math.round(zoom * 100)}%`;
  }
  function render() {
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
      const small = document.createElement("small");
      small.textContent = `${s2.size} \xB7 ${s2.type}`;
      b.append(small);
      b.onclick = () => {
        selected = s2.id;
        render();
      };
      $("mountList").append(b);
    }
    const s = current();
    $("properties").hidden = !s;
    $("empty").hidden = !!s;
    if (s) {
      for (const [id, value] of Object.entries({ slotId: s.id, forward: s.locations[0], port: s.locations[1], slotCategory: s.type, slotSize: s.size, slotMount: s.mount, angle: s.angle, arc: s.arc })) set(id, value);
    }
    const checks = validate(project);
    $("checks").replaceChildren();
    for (const [text, cls] of [...checks.errors.map((x) => [x, "error"]), ...checks.warnings.map((x) => [x, "warning"])]) {
      const p = document.createElement("div");
      p.className = cls;
      p.textContent = text;
      $("checks").append(p);
    }
    if (!checks.errors.length && !checks.warnings.length) $("checks").textContent = "\u2713 Layout checks passed";
    $("export").disabled = !!checks.errors.length;
    $("undo").disabled = history.index === 0;
    $("redo").disabled = history.index === history.items.length - 1;
    draw();
  }
  function load(p) {
    project = p;
    history = new History(p);
    selected = "";
    zoom = 1;
    dirty = false;
    render();
    status(`Loaded ${p.hull.hullName} \xB7 ${p.hull.weaponSlots.length} mounts`);
  }
  function mayReplace() {
    return !dirty || confirm("Replace the current project? Save it first if you want to keep your changes.");
  }
  async function example() {
    try {
      if (project && !mayReplace()) return;
      const hull = await (await fetch("assets/verdant.ship")).json();
      const blob = await (await fetch("assets/verdant.png")).blob();
      load(fromShip(hull, await dataURL(blob)));
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
      if (file.size > 4e7) throw Error("File limit is 40 MB.");
      if (file.name.toLowerCase().endsWith(".png")) {
        if (!mayReplace()) return;
        const data = await dataURL(file);
        const image = new Image();
        image.src = data;
        await image.decode();
        if (image.width > 16384 || image.height > 16384) throw Error("Maximum image dimension is 16384 pixels.");
        const id = file.name.replace(/\.png$/i, "").replace(/[^a-zA-Z0-9_-]/g, "_") || "new_ship";
        load(fromShip({ hullId: id, hullName: "New ship", hullSize: "DESTROYER", style: "HIGH_TECH", width: image.width, height: image.height, center: [image.width / 2, image.height / 2], spriteName: `graphics/ships/${id}.png`, collisionRadius: Math.min(image.width, image.height) / 2, shieldCenter: [0, 0], shieldRadius: Math.max(image.width, image.height) / 2, bounds: [], weaponSlots: [], engineSlots: [] }, data));
        status("PNG loaded. Place mounts; artwork should face upward.");
        dirty = true;
      } else if (file.name.toLowerCase().endsWith(".ship")) {
        const p = fromShip(JSON.parse(await file.text()), project.image);
        const result = validate(p);
        if (result.errors.length) throw Error(result.errors.join(" "));
        if (mayReplace()) {
          load(p);
          dirty = true;
          status("Layout imported onto the current sprite.");
        }
      } else {
        const p = parseProject(await file.text());
        const img = new Image();
        img.src = p.image;
        await img.decode();
        if (mayReplace()) load(p);
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
    const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1e3);
    return true;
  }
  on("save", () => {
    void save(`${project.hull.hullId}.shipwright.json`, JSON.stringify(project, null, 2)).then((ok) => {
      if (ok) {
        dirty = false;
        status("Project saved with embedded sprite.");
      }
    }).catch((e) => status(String(e)));
  });
  on("export", () => {
    const hull = toShip(project);
    void save(`${hull.hullId}.ship`, JSON.stringify(hull, null, 2)).then((ok) => {
      if (ok) status("Layout exported. Keep the PNG at the specified sprite path.");
    }).catch((e) => status(String(e)));
  });
  on("example", () => void example());
  on("imageOpen", () => pick(".png"));
  on("projectOpen", () => pick(".json"));
  on("importShip", () => pick(".ship"));
  for (const id of ["category", "slotCategory"]) for (const c of categories) {
    const o = document.createElement("option");
    o.value = c;
    o.textContent = c;
    $(id).append(o);
  }
  for (const [id, key] of [["name", "hullName"], ["hullId", "hullId"], ["class", "hullSize"], ["spritePath", "spriteName"]]) $(id).addEventListener("change", () => {
    project.hull[key] = val(id);
    commit();
  });
  for (const id of ["slotId", "forward", "port", "slotCategory", "slotSize", "slotMount", "angle", "arc"]) $(id).addEventListener("change", () => {
    const s = current();
    if (!s) return;
    const idValue = val("slotId");
    if (!idValue || project.hull.weaponSlots.some((x) => x !== s && x.id === idValue)) {
      status("Choose a unique, nonempty mount ID.");
      render();
      return;
    }
    const numbers = ["forward", "port", "angle", "arc"].map((x) => Number(val(x)));
    if (!numbers.every(Number.isFinite) || numbers[3] < 0 || numbers[3] > 360) {
      status("Use finite numbers and an arc between 0 and 360.");
      render();
      return;
    }
    Object.assign(s, { id: idValue, locations: [numbers[0], numbers[1]], angle: numbers[2], arc: numbers[3], type: val("slotCategory"), size: val("slotSize"), mount: val("slotMount") });
    selected = s.id;
    commit();
  });
  on("resize", () => {
    const factor = Number(val("scale"));
    if (factor <= 0 || factor > 10 || project.hull.width * factor > 16384 || project.hull.height * factor > 16384) throw Error("Choose a scale greater than 0, at most 10, within 16384 units.");
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
    project.hull.weaponSlots = project.hull.weaponSlots.filter((x) => x.id !== selected);
    selected = "";
    commit();
  });
  function undo() {
    const p = history.undo();
    if (p) {
      project = p;
      dirty = true;
      render();
    }
  }
  function redo() {
    const p = history.redo();
    if (p) {
      project = p;
      dirty = true;
      render();
    }
  }
  on("undo", undo);
  on("redo", redo);
  on("zoomIn", () => {
    zoom = Math.min(8, zoom * 1.25);
    draw();
  });
  on("zoomOut", () => {
    zoom = Math.max(0.25, zoom / 1.25);
    draw();
  });
  on("fit", () => {
    zoom = 1;
    draw();
  });
  for (const id of ["showBounds", "showShield", "showLabels"]) $(id).addEventListener("change", draw);
  var drag = null;
  svg.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    const target = e.target;
    const handle = target.closest("[data-handle]")?.getAttribute("data-handle");
    const slotId = target.closest("[data-slot]")?.getAttribute("data-slot");
    if (handle && current()) {
      drag = { kind: handle, id: selected, start: point2(e), original: clone(current().locations), moved: false };
      svg.setPointerCapture(e.pointerId);
      return;
    }
    if (slotId) {
      selected = slotId;
      render();
      drag = { kind: "move", id: slotId, start: point2(e), original: clone(current().locations), moved: false };
      svg.setPointerCapture(e.pointerId);
      return;
    }
    if (placing) {
      const location = toGame(project, point2(e)).map((x) => Math.round(x * 10) / 10);
      const s = { id: nextId(project), locations: location, type: val("category"), size: val("size"), mount: val("mount"), angle: 0, arc: val("mount") === "HARDPOINT" ? 10 : 240 };
      project.hull.weaponSlots.push(s);
      if ($("symmetric").checked && Math.abs(location[1]) > 0.1) project.hull.weaponSlots.push(mirror(project, s));
      selected = s.id;
      commit();
    } else {
      selected = "";
      render();
    }
  });
  svg.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const s = project.hull.weaponSlots.find((x) => x.id === drag.id);
    if (!s) return;
    const q = point2(e);
    drag.moved = true;
    if (drag.kind === "move") {
      const origin = toScreen(project, drag.original);
      s.locations = toGame(project, [origin[0] + q[0] - drag.start[0], origin[1] + q[1] - drag.start[1]]).map((x) => Math.round(x * 10) / 10);
    } else {
      const p = toScreen(project, s.locations);
      const angle = Math.atan2(p[0] - q[0], p[1] - q[1]) * 180 / Math.PI;
      if (drag.kind === "aim") s.angle = Math.round(angle);
      else {
        s.arc = Math.min(360, Math.round(2 * Math.abs((angle - s.angle + 540) % 360 - 180)));
      }
    }
    draw();
  });
  svg.addEventListener("pointerup", () => {
    if (drag?.moved) commit();
    drag = null;
  });
  svg.addEventListener("pointercancel", () => {
    if (drag?.moved) commit();
    drag = null;
  });
  svg.addEventListener("wheel", (e) => {
    e.preventDefault();
    zoom = Math.max(0.25, Math.min(8, zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1)));
    draw();
  }, { passive: false });
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
    if (dirty) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
  var vp = $("viewport");
  vp.addEventListener("dragover", (e) => {
    e.preventDefault();
    vp.classList.add("dragover");
  });
  vp.addEventListener("dragleave", () => vp.classList.remove("dragover"));
  vp.addEventListener("drop", (e) => {
    e.preventDefault();
    vp.classList.remove("dragover");
    if (e.dataTransfer?.files[0]) void readFile(e.dataTransfer.files[0]);
  });
  window.addEventListener("dragover", (e) => e.preventDefault());
  window.addEventListener("drop", (e) => e.preventDefault());
  void example();
})();
