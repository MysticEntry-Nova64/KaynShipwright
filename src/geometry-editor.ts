import {choosePackageMetadata} from "./package-dialog";
import { clone, toGame, toScreen, validate } from "./core";
import type { Project, Point } from "./core";
import { previewPNG } from "./preview";
import {
  edit,
  addEngine,
  copyEngine,
  rectangleBounds,
  insertVertex,
} from "./geometry";
import type { Selection } from "./geometry";
import type { GestureController } from "./gesture";
interface Host {
  gestures: GestureController;
  invalidate: () => void;
  svg: SVGSVGElement;
  get: () => Project;
  set: (p: Project) => void;
  commit: () => void;
  draw: () => void;
  render: () => void;
  status: (s: string) => void;
  save: (name: string, text: string) => Promise<boolean>;
}
const NS = "http://www.w3.org/2000/svg";
export function installGeometry(host: Host) {
  const $ = (id: string) => document.getElementById(id)!;
  const input = (id: string) => $(id) as HTMLInputElement;
  let selection: Selection | null = null,
    drag: {
      selection: Selection;
      before: Project;
      start: Point;
      moved: boolean;
    } | null = null;
  const mode = () => input("editTool").value;
  const menu = $("geometryMenu");
  const round = (n: number) => Math.round(n * 10) / 10;
  const screenPoint = (event: MouseEvent): Point => {
    const matrix = host.svg.getScreenCTM();
    if (!matrix) throw Error("Canvas unavailable");
    const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(
      matrix.inverse(),
    );
    return [p.x, p.y];
  };
  function node(
    tag: string,
    attrs: Record<string, unknown>,
    parent: Element = host.svg,
  ) {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
    parent.append(e);
    return e;
  }
  function handle(
    p: Point,
    kind: string,
    index: number,
    title: string,
    color: string,
    shape = "circle",
  ) {
    const attrs =
      shape === "rect"
        ? { x: p[0] - 3, y: p[1] - 3, width: 6, height: 6 }
        : { cx: p[0], cy: p[1], r: 3.5 };
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
      class: "geometry-handle",
    });
    node("title", {}, e).textContent = title;
    return e;
  }
  function label(p: Point, text: string, color: string) {
    node("text", {
      x: p[0] + 5,
      y: p[1] - 5,
      fill: color,
      class: "geometry-label",
    }).textContent = text;
  }
  function line(
    a: Point,
    b: Point,
    color: string,
    extra: Record<string, unknown> = {},
  ) {
    node("line", {
      x1: a[0],
      y1: a[1],
      x2: b[0],
      y2: b[1],
      stroke: color,
      "stroke-width": 1,
      "pointer-events": "none",
      ...extra,
    });
  }
  function draw() {
    if (!host.get()) return;
    host.svg.dataset.tool = mode();
    const p = host.get(),
      h = p.hull;
    if (input("showBounds").checked || mode() === "engines")
      h.engineSlots.forEach((e, i) => {
        const q = toScreen(p, e.location),
          rad = (e.angle * Math.PI) / 180,
          dir: Point = [-Math.sin(rad), -Math.cos(rad)],
          side: Point = [Math.cos(rad), -Math.sin(rad)];
        const tip: Point = [q[0] + dir[0] * e.length, q[1] + dir[1] * e.length];
        const a: Point = [
            q[0] + (side[0] * e.width) / 2,
            q[1] + (side[1] * e.width) / 2,
          ],
          b: Point = [
            q[0] - (side[0] * e.width) / 2,
            q[1] - (side[1] * e.width) / 2,
          ];
        const col =
          selection?.kind === "engine" && selection.index === i
            ? "#fff3bc"
            : "#ffad70";
        line(a, b, col, { "stroke-width": 2 });
        line(q, tip, col);
        line(
          tip,
          [
            tip[0] - dir[0] * 6 + side[0] * 3,
            tip[1] - dir[1] * 6 + side[1] * 3,
          ],
          col,
        );
        line(
          tip,
          [
            tip[0] - dir[0] * 6 - side[0] * 3,
            tip[1] - dir[1] * 6 - side[1] * 3,
          ],
          col,
        );
        label(q, `E${i + 1} · ${round(e.width)}w · ${round(e.angle)}°`, col);
        if (mode() === "engines") {
          handle(q, "engine", i, `Engine ${i + 1}: drag position`, col, "rect");
          if (selection?.kind === "engine" && selection.index === i) {
            handle(
              tip,
              "engineDirection",
              i,
              "Drag exhaust direction and length",
              "#ffd574",
            );
            handle(
              [a[0] + side[0] * 8, a[1] + side[1] * 8],
              "engineWidth",
              i,
              "Drag engine width",
              "#ffc895",
            );
          }
        }
      });
    if (input("showShield").checked || mode() === "shield") {
      const q = toScreen(p, h.shieldCenter),
        r = h.shieldRadius;
      node("circle", {
        cx: q[0],
        cy: q[1],
        r,
        fill: "none",
        stroke: "#73cafa",
        "stroke-width": 1,
        "stroke-dasharray": "5 3",
        "pointer-events": "none",
      });
      line([q[0] - 5, q[1]], [q[0] + 5, q[1]], "#73cafa");
      line([q[0], q[1] - 5], [q[0], q[1] + 5], "#73cafa");
      label(q, `Shield · r ${round(r)}`, "#73cafa");
      if (mode() === "shield") {
        handle(q, "shield", 0, "Drag shield center", "#73cafa", "rect");
        handle([q[0] + r, q[1]], "radius", 0, "Drag shield radius", "#b5eaff");
      }
    }
    if (input("showBounds").checked || mode() === "bounds") {
      const points: Point[] = [];
      for (let i = 0; i < h.bounds.length; i += 2)
        points.push(toScreen(p, [h.bounds[i], h.bounds[i + 1]]));
      node("polygon", {
        points: points.map((q) => q.join(",")).join(" "),
        fill: "none",
        stroke: "#b0e699",
        "stroke-width": 1,
        "pointer-events": "none",
      });
      if (mode() === "bounds") {
        points.forEach((q, i) => {
          handle(
            q,
            "vertex",
            i,
            `Bounds vertex ${i + 1}: drag; right-click for options`,
            selection?.kind === "vertex" && selection.index === i
              ? "#ffffff"
              : "#b0e699",
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
          "pointer-events": "none",
        });
        handle(
          [center[0] + h.collisionRadius, center[1]],
          "collision",
          0,
          "Drag collision radius",
          "#dc98e8",
        );
        label(center, `Collision r ${round(h.collisionRadius)}`, "#dc98e8");
      }
    }
  }
  function perform(change: (p: Project) => void) {
    try {
      host.gestures.finish();
      host.set(edit(host.get(), change));
      host.commit();
    } catch (e) {
      host.status(`Edit rejected: ${e}`);
      host.render();
    }
  }
  function render() {
    if (!host.get()) return;
    $("geometryInspector").hidden = mode() === "weapons";
    $("weaponInspector").hidden = mode() !== "weapons";
    $("geometrySelection").textContent = selection
      ? selection.kind === "engine"
        ? `Engine ${selection.index + 1}`
        : selection.kind === "vertex"
          ? `Bounds vertex ${selection.index + 1}`
          : selection.kind === "shield"
            ? "Shield center"
            : selection.kind === "radius"
              ? "Shield radius"
              : "Collision radius"
      : "Right-click the canvas to add or select geometry.";
    const fields = $("geometryFields");
    fields.replaceChildren();
    if (!selection) return;
    const s = selection,
      h = host.get().hull;
    const field = (
      title: string,
      value: number | string,
      update: (p: Project, value: any) => void,
      numeric = true,
    ) => {
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
          render();
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
        (p, v) => (p.hull.engineSlots[s.index].location[0] = v),
      );
      field(
        "Port",
        e.location[1],
        (p, v) => (p.hull.engineSlots[s.index].location[1] = v),
      );
      for (const [key, title] of [
        ["angle", "Exhaust direction °"],
        ["width", "Engine width"],
        ["length", "Exhaust length"],
        ["contrailSize", "Contrail size"],
      ])
        field(
          title,
          e[key] ?? 0,
          (p, v) => (p.hull.engineSlots[s.index][key] = v),
        );
      field(
        "Engine style",
        e.style ?? "HIGH_TECH",
        (p, v) => {
          if (!/^[A-Z0-9_]+$/.test(v)) throw Error("Use an engine style ID.");
          p.hull.engineSlots[s.index].style = v;
        },
        false,
      );
    } else if (s.kind === "shield" || s.kind === "radius") {
      field(
        "Shield forward",
        h.shieldCenter[0],
        (p, v) => (p.hull.shieldCenter[0] = v),
      );
      field(
        "Shield port",
        h.shieldCenter[1],
        (p, v) => (p.hull.shieldCenter[1] = v),
      );
      field(
        "Shield radius",
        h.shieldRadius,
        (p, v) => (p.hull.shieldRadius = v),
      );
    } else if (s.kind === "vertex") {
      field(
        "Vertex forward",
        h.bounds[s.index * 2],
        (p, v) => (p.hull.bounds[s.index * 2] = v),
      );
      field(
        "Vertex port",
        h.bounds[s.index * 2 + 1],
        (p, v) => (p.hull.bounds[s.index * 2 + 1] = v),
      );
    } else
      field(
        "Collision radius",
        h.collisionRadius,
        (p, v) => (p.hull.collisionRadius = v),
      );
  }
  function getSelection(target: Element): Selection | null {
    const e = target.closest("[data-geometry]");
    if (!e) return null;
    const kind = e.getAttribute("data-geometry")!,
      index = Number(e.getAttribute("data-index"));
    if (kind.startsWith("engine")) return { kind: "engine", index };
    if (kind === "vertex") return { kind, index };
    return { kind: kind as "shield" | "radius" | "collision" };
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
      const target = event.target as Element,
        s = getSelection(target);
      selection = s;
      render();
      if (!s) {
        host.draw();
        return;
      }
      const specific = target
        .closest("[data-geometry]")!
        .getAttribute("data-geometry")!;
      drag = {
        selection: s,
        before: clone(host.get()),
        start: screenPoint(event),
        moved: false,
      };
      host.svg.dataset.dragKind = specific;
      host.gestures.begin(event.pointerId, end);
      host.draw();
    },
    true,
  );
  host.svg.addEventListener(
    "pointermove",
    (event) => {
      if (!drag || !host.gestures.owns(event.pointerId)) return;
      event.stopImmediatePropagation();
      const q = screenPoint(event),
        s = drag.selection,
        before = drag.before;
      if (Math.hypot(q[0] - drag.start[0], q[1] - drag.start[1]) < 0.1) return;
      drag.moved = true;
      const p = clone(before),
        h = p.hull,
        kind = host.svg.dataset.dragKind;
      if (s.kind === "engine") {
        const e = h.engineSlots[s.index],
          origin = toScreen(p, e.location),
          dx = q[0] - origin[0],
          dy = q[1] - origin[1];
        if (kind === "engineDirection") {
          e.angle = round((Math.atan2(-dx, -dy) * 180) / Math.PI);
          e.length = round(Math.max(0.1, Math.hypot(dx, dy)));
        } else if (kind === "engineWidth") {
          const rad = (e.angle * Math.PI) / 180;
          e.width = round(
            Math.max(
              0.1,
              2 * (Math.abs(dx * Math.cos(rad) - dy * Math.sin(rad)) - 8),
            ),
          );
        } else {
          const start = toScreen(
            before,
            before.hull.engineSlots[s.index].location,
          );
          e.location = toGame(p, [
            start[0] + q[0] - drag.start[0],
            start[1] + q[1] - drag.start[1],
          ]).map(round);
        }
      } else if (s.kind === "vertex") {
        const start = toScreen(before, [
            before.hull.bounds[s.index * 2],
            before.hull.bounds[s.index * 2 + 1],
          ]),
          v = toGame(p, [
            start[0] + q[0] - drag.start[0],
            start[1] + q[1] - drag.start[1],
          ]).map(round);
        h.bounds.splice(s.index * 2, 2, ...v);
      } else if (s.kind === "shield") {
        const start = toScreen(before, before.hull.shieldCenter);
        h.shieldCenter = toGame(p, [
          start[0] + q[0] - drag.start[0],
          start[1] + q[1] - drag.start[1],
        ]).map(round) as Point;
      } else {
        const c = toScreen(p, s.kind === "radius" ? h.shieldCenter : [0, 0]);
        h[s.kind === "radius" ? "shieldRadius" : "collisionRadius"] = round(
          Math.hypot(q[0] - c[0], q[1] - c[1]),
        );
      }
      host.set(p);
      host.draw();
    },
    true,
  );
  function end(cancel: boolean) {
    if (!drag) return;
    const saved = drag;
    drag = null;
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
    const p = host.get(),
      q = toGame(p, screenPoint(event)).map(round) as Point;
    selection = getSelection(event.target as Element);
    render();
    host.draw();
    menu.replaceChildren();
    function action(title: string, fn: () => void) {
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
      ["bounds", "Collision bounds"],
    ]) {
      action(title, () => {
        input("editTool").value = value;
        input("editTool").dispatchEvent(new Event("change"));
        host.status(`${title} tool selected. Right-click for actions.`);
      });
      const button = menu.lastElementChild as HTMLButtonElement;
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
        perform((p) => addEngine(p, q));
        selection = {
          kind: "engine",
          index: host.get().hull.engineSlots.length - 1,
        };
        host.render();
      });
      if (selection?.kind === "engine") {
        const i = selection.index;
        action("Duplicate engine", () => {
          perform((p) => copyEngine(p, i));
          selection = {
            kind: "engine",
            index: host.get().hull.engineSlots.length - 1,
          };
          host.render();
        });
        action("Mirror engine", () => {
          perform((p) => copyEngine(p, i, true));
          selection = {
            kind: "engine",
            index: host.get().hull.engineSlots.length - 1,
          };
          host.render();
        });
        action("Delete engine", () => {
          selection = null;
          perform((p) => {
            p.hull.engineSlots.splice(i, 1);
          });
        });
      }
    }
    if (mode() === "shield") {
      action("Set shield center here", () => {
        selection = { kind: "shield" };
        perform((p) => (p.hull.shieldCenter = q));
      });
      action("Select shield radius", () => {
        selection = { kind: "radius" };
        host.render();
      });
      action(
        p.hull.shieldRadius > 0
          ? "Disable shield circle (radius 0)"
          : "Enable shield circle",
        () => {
          selection = { kind: "radius" };
          perform(
            (p) =>
              (p.hull.shieldRadius =
                p.hull.shieldRadius > 0
                  ? 0
                  : Math.max(p.hull.width, p.hull.height) / 2),
          );
        },
      );
    }
    if (mode() === "bounds") {
      if (p.hull.bounds.length)
        action("Insert vertex on nearest edge", () => {
          perform((p) => {
            selection = { kind: "vertex", index: insertVertex(p, q) };
          });
        });
      if (selection?.kind === "vertex") {
        const i = selection.index;
        action("Delete vertex", () => {
          selection = null;
          perform((p) => {
            p.hull.bounds.splice(i * 2, 2);
          });
        });
      }
      action("Select collision radius", () => {
        selection = { kind: "collision" };
        host.render();
      });
      action(
        p.hull.bounds.length
          ? "Replace outline with sprite rectangle…"
          : "Create rectangle outline",
        () => {
          if (
            p.hull.bounds.length &&
            !confirm(
              "Replace the collision outline with a rectangle? You can undo this.",
            )
          )
            return;
          selection = null;
          perform(rectangleBounds);
        },
      );
      if (p.hull.bounds.length)
        action("Clear outline…", () => {
          if (
            confirm(
              "Remove the outline? Collision radius remains. You can undo this.",
            )
          ) {
            selection = null;
            perform((p) => (p.hull.bounds = []));
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
    if (!menu.contains(e.target as Node)) menu.hidden = true;
  });
  menu.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      menu.hidden = true;
      input("editTool").focus();
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const buttons = Array.from(menu.querySelectorAll("button")),
        i = buttons.indexOf(document.activeElement as HTMLButtonElement);
      buttons[
        (i + (e.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length
      ]?.focus();
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
  $("exportPackage").addEventListener("click", () => {
    void (async () => {
      host.gestures.finish();
      const snapshot = clone(host.get()),
        errors = validate(snapshot).errors;
      if (errors.length) throw Error(errors.join("\n"));
      if (!window.desktop?.exportPackage)
        throw Error("Open the desktop app to export a design package.");
      const metadata=await choosePackageMetadata(snapshot.hull.hullName,false,snapshot.hull.hullId);if(!metadata){host.status("Package export canceled.");return;}
      const result = await window.desktop.exportPackage(
        snapshot,
        await previewPNG(snapshot),
        metadata,
      );
      host.status(
        result
          ? `Design package exported: ${result}`
          : "Package export canceled.",
      );
    })().catch((e) => host.status(`Package export failed: ${e}`));
  });
  return {
    draw,
    render,
    reset: () => {
      selection = null;
      drag = null;
      menu.hidden = true;
    },
  };
}
