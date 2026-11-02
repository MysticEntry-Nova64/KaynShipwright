import { installStudioUI } from "./studio-ui";
import {choosePackageMetadata,packageSettings,restorePackageSettings} from "./package-dialog";
import { RecoveryWriter } from "./recovery-writer";
import { outlineForProject } from "./auto-outline";
import { previewPNG } from "./preview";
import type { WorkspaceSnapshot } from "./desktop-api";
import { preparePNGDrop, DROP_BYTES } from "./png-drop";

import { installShipLibrary } from "./ship-library";

import { installStartup } from './startup';

import { DocumentSession } from "./document-session";

import { GestureController } from "./gesture";

import { installGeometry } from "./geometry-editor";

import { drawReferences, loadReference } from "./references";

import {

  categories,

  clone,

  fromShip,

  History,

  mirror,

  moveSlot,

  slotPoints,

  nextId,

  parseProject,

  resize,

  toGame,

  toScreen,

  toShip,

  validate,

} from "./core";

import type { Project, Slot, Point, Locations } from "./core";

import type { DesktopAPI } from "./desktop-api";

declare global {

  interface Window {

    desktop?: DesktopAPI;

  }

}

installStartup(window.desktop);

const $ = <T extends HTMLElement = HTMLElement>(id: string) =>

  document.getElementById(id) as T;

const val = (id: string) => $<HTMLInputElement>(id).value;

const set = (id: string, v: unknown) => {

  $<HTMLInputElement>(id).value = String(v);

};

const on = (id: string, fn: () => void) =>

  $(id).addEventListener("click", () => {

    try {

      gestures.finish();

      fn();

    } catch (e) {

      status(String(e));

    }

  });

const svg = document.getElementById("canvas") as unknown as SVGSVGElement;

const NS = "http://www.w3.org/2000/svg";

const gestures = new GestureController(svg);

let project: Project,

  history: History,

  selected = "",

  placing = false,

  zoom = 1,

  dirty = false;

let session = new DocumentSession();

let historyRevisions: number[] = [];

let saveInFlight = false;

interface DesignDocument {
 id:string; project:Project; dirty:boolean; history:History; session:DocumentSession;
 revisions:number[]; selected:string; zoom:number; tool:string; autoAttempted:boolean; outlineTask?:Promise<void>;
}
const droppedDesigns:DesignDocument[]=[];
let activeDrop=-1,workspaceReady=false,recoveryTimer:ReturnType<typeof setTimeout>|undefined;
const recoveryWriter=new RecoveryWriter<WorkspaceSnapshot>(
 value=>window.desktop!.workspaceWrite(value),
 outcome=>{if(!outcome.ok)$('workspaceState').textContent='Recovery failed — save projects: '+outcome.error;
 else if(!recoveryTimer)$('workspaceState').textContent='Workspace recovery up to date';}
);
const studioUI=installStudioUI({
 selectMount(id){gestures.finish();selected=id;render();},
 layoutChanged(){gestures.finish();requestAnimationFrame(()=>project&&draw());},
 exportState(scope){const docs=scope==='all'?droppedDesigns:[droppedDesigns[activeDrop]];const active=docs.filter(Boolean);return {names:active.map(d=>d.project.hull.hullName),mounts:active.reduce((n,d)=>n+d.project.hull.weaponSlots.length,0),errors:active.flatMap(d=>validate(d.project).errors.map(e=>d.project.hull.hullName+': '+e))};}
});
function newDocument(p:Project,unsaved:boolean):DesignDocument {
 const owner=new DocumentSession();owner.load(unsaved);
 return {id:crypto.randomUUID(),project:p,dirty:owner.dirty,history:new History(p),session:owner,revisions:[owner.revision],selected:'',zoom:1,tool:'weapons',autoAttempted:false};
}
function rememberDrop(){
 const d=droppedDesigns[activeDrop];if(!d||!project)return;
 Object.assign(d,{project,dirty:session.dirty,history,session,revisions:historyRevisions,selected,zoom,tool:val('editTool')});
}
function snapshotWorkspace():WorkspaceSnapshot {
 rememberDrop();return {format:1,packageSettings:packageSettings(),active:activeDrop,documents:droppedDesigns.map(d=>({id:d.id,project:clone(d.project),dirty:d.session.dirty,zoom:d.zoom,selected:d.selected,tool:d.tool,autoAttempted:d.autoAttempted}))};
}
function persistWorkspace():void{
 if(!workspaceReady||!window.desktop||activeDrop<0)return;
 clearTimeout(recoveryTimer);recoveryTimer=undefined;
 recoveryWriter.enqueue(snapshotWorkspace());
}
document.addEventListener('package-settings-changed',()=>scheduleRecovery());
function scheduleRecovery(){if(!workspaceReady)return;clearTimeout(recoveryTimer);$('workspaceState').textContent='Updating workspace recovery…';recoveryTimer=setTimeout(()=>{recoveryTimer=undefined;try{persistWorkspace();}catch(error){$('workspaceState').textContent='Recovery failed — save projects: '+error;}},350);}
function drawDropped(){
 if(project)studioUI.fileState(session.dirty);
 const panel=$('droppedPanel'),list=$('droppedDesigns');panel.hidden=!droppedDesigns.length;list.replaceChildren();
 droppedDesigns.forEach((d,i)=>{
  const button=document.createElement('button');button.type='button';button.dataset.dropIndex=String(i);button.classList.toggle('active',i===activeDrop);
  const img=document.createElement('img');img.src=d.project.image;img.alt='';const label=document.createElement('span');label.textContent=d.project.hull.hullName+' · '+d.project.hull.hullSize+(d.session.dirty?' *':'');button.append(img,label);button.onclick=()=>openDropped(i);
  button.oncontextmenu=event=>{event.preventDefault();if(droppedDesigns.length===1){status('Keep at least one ship open.');return;}if(d.session.dirty&&!confirm('Close this unsaved design? Save it first to keep a project copy.'))return;gestures.finish();rememberDrop();const current=droppedDesigns[activeDrop];droppedDesigns.splice(i,1);activeDrop=-1;activateDocument(Math.max(0,droppedDesigns.indexOf(current)));scheduleRecovery();};
  button.title='Switch ship. Right-click to close this design.';list.append(button);
 });
}
function activateDocument(index:number){
 const d=droppedDesigns[index];activeDrop=index;project=d.project;history=d.history;session=d.session;historyRevisions=d.revisions;selected=d.selected;zoom=d.zoom;dirty=session.dirty;set('editTool',d.tool);placing=false;geometry?.reset();render();drawDropped();
}
function openDropped(index:number){if(index===activeDrop)return;gestures.finish();rememberDrop();activateDocument(index);scheduleRecovery();void autoOutline();}
function autoOutline(d=droppedDesigns[activeDrop]):Promise<void>{
 if(!d)return Promise.resolve();if(d.outlineTask)return d.outlineTask;
 return d.outlineTask=generateAndApplyOutline(d);
}
async function generateAndApplyOutline(d:DesignDocument){
 if(d.autoAttempted||d.project.hull.bounds.length)return;
 d.autoAttempted=true;const owner=d.session,ticket=owner.beginSave(),image=d.project.image;
 try{const generated=await outlineForProject(clone(d.project));
  // Do not overwrite manual geometry or edits made while image decoding was pending.
  if(!droppedDesigns.includes(d)||owner.revision!==ticket.revision||d.project.image!==image||d.project.hull.bounds.length)return;
  if(d===droppedDesigns[activeDrop]){gestures.finish();if(owner.revision!==ticket.revision)return;project.hull.bounds=generated.bounds;project.omittedArrays=project.omittedArrays?.filter(k=>k!=='bounds');commit();}
  else {d.project=clone(d.project);d.project.hull.bounds=generated.bounds;d.project.omittedArrays=d.project.omittedArrays?.filter(k=>k!=='bounds');d.revisions=d.revisions.slice(0,d.history.index+1);d.history.push(d.project);owner.change();d.revisions.push(owner.revision);if(d.revisions.length>80)d.revisions.shift();d.dirty=true;drawDropped();scheduleRecovery();}
  status('Automatic '+generated.result.method+' outline added ('+generated.result.points.length+' vertices). Manual editing and Undo remain available.'+(generated.result.reason?' '+generated.result.reason:''));
 }catch(error){status('Automatic outline skipped: '+error);scheduleRecovery();}
}
async function restoreWorkspace(){
 try{const result=await window.desktop?.workspaceRead();if(result?.workspace){const saved=result.workspace;restorePackageSettings(saved.packageSettings);for(const d of saved.documents){const doc=newDocument(d.project,d.dirty);Object.assign(doc,{id:d.id,zoom:d.zoom,selected:d.selected,tool:d.tool,autoAttempted:d.autoAttempted});droppedDesigns.push(doc);}activateDocument(saved.active);workspaceReady=true;$('workspaceState').textContent='Workspace recovery up to date';status('Restored '+droppedDesigns.length+' designs, including unsaved drafts. Undo starts fresh after reopening.'+(result.warning?' '+result.warning:''));for(const d of droppedDesigns)void autoOutline(d);return;}
  await example();workspaceReady=true;if(result?.warning)status(result.warning);scheduleRecovery();
 }catch(error){await example();workspaceReady=true;status('Workspace could not be restored: '+error);}
}
let allowClose=false,closeBusy=false;
const closeDialog=$<HTMLDialogElement>('closeDialog');
window.desktop?.onPrepareClose(()=>{
 if(closeBusy)return;
 if(closeDialog.open){$('closeKeepEditing').focus();return;}
 if(!workspaceReady){status('Workspace is still loading. Try closing again when loading finishes.');return;}
 gestures.finish();rememberDrop();const unsaved=droppedDesigns.filter(d=>d.session.dirty).length;
 $('closeDescription').textContent=unsaved?`${unsaved} design${unsaved===1?' has':'s have'} unsaved changes. Choose what to keep for next time.`:'Choose whether to restore your open designs next time.';
 $('closeError').hidden=true;closeDialog.showModal();$('closeKeepEditing').focus();
});
function keepEditing(){if(!closeBusy)closeDialog.close();}
$('closeKeepEditing').onclick=keepEditing;
closeDialog.addEventListener('cancel',event=>{event.preventDefault();keepEditing();});
async function finishClose(mode:'recover'|'discard'){
 if(closeBusy)return;
 if(saveInFlight||batchInFlight){$('closeError').hidden=false;$('closeError').textContent='Wait for the current save or export to finish, then try again.';return;}
 closeBusy=true;for(const id of ['closeKeepEditing','closeRecover','closeAll'])$<HTMLButtonElement>(id).disabled=true;
 const wasReady=workspaceReady;
 try{
  gestures.finish();rememberDrop();
  if(mode==='recover'){persistWorkspace();await recoveryWriter.flush();}
  // Block late debounced or decode-triggered recovery writes before clearing either copy.
  workspaceReady=false;clearTimeout(recoveryTimer);recoveryTimer=undefined;await recoveryWriter.flush().catch(()=>{});
  await window.desktop!.prepareExit(mode);allowClose=true;window.desktop!.closeReady();
 }catch(error){workspaceReady=wasReady;allowClose=false;closeBusy=false;$('closeError').hidden=false;$('closeError').textContent='Could not close: '+error+'. Your designs are still open.';for(const id of ['closeKeepEditing','closeRecover','closeAll'])$<HTMLButtonElement>(id).disabled=false;}
}
$('closeRecover').onclick=()=>void finishClose('recover');
$('closeAll').onclick=()=>void finishClose('discard');
async function dropPNGs(files:File[]) {

 try{

  gestures.finish();rememberDrop();const ticket=session.beginLoad();

  const bytes=droppedDesigns.reduce((sum,d)=>sum+Math.floor(d.project.image.length*3/4),0)+files.reduce((sum,f)=>sum+f.size,0);

  if(bytes>DROP_BYTES)throw Error("Dropped design shelf limit is 80 MB; save and reopen a fresh window.");

  const batch=await preparePNGDrop(files,droppedDesigns.map(d=>d.project.hull.hullId),()=>session.accepts(ticket));

  if(!batch.length||!session.accepts(ticket))return;

  if(activeDrop<0&&!mayReplace())return;

  if(!session.accepts(ticket))return;

  const first=droppedDesigns.length;droppedDesigns.push(...batch.map(project=>newDocument(project,true)));openDropped(first);await Promise.all(droppedDesigns.slice(first).map(d=>autoOutline(d)));

  status(`${batch.length} PNG${batch.length===1?"":"s"} dropped. Select a design above; edits stay with each draft. Class suffixes set starting sizes.`);

 }catch(error){status(`Drop failed: ${error}`);}

}

const colors: Record<string, string> = {

  ENERGY: "#32b8f4",

  BALLISTIC: "#edb56b",

  MISSILE: "#ed7777",

  SYNERGY: "#be86dd",

  HYBRID: "#72d9b6",

  COMPOSITE: "#e3ba87",

  UNIVERSAL: "#e4d65b",

  DECORATIVE: "#9babb3",

  BUILT_IN: "#c4c4c4",

};

function status(s: string) {

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

function el(

  tag: string,

  attrs: Record<string, unknown>,

  parent: Element = svg,

) {

  const e = document.createElementNS(NS, tag);

  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));

  parent.append(e);

  return e;

}

function point(event: PointerEvent): Point {

  const matrix = svg.getScreenCTM();

  if (!matrix) return [0, 0];

  const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(

    matrix.inverse(),

  );

  return [p.x, p.y];

}

function polar(origin: Point, deg: number, r: number): Point {

  const rad = (deg * Math.PI) / 180;

  return [origin[0] - Math.sin(rad) * r, origin[1] - Math.cos(rad) * r];

}

function draw() {

  if (!project) return;

  svg.replaceChildren();

  const h = project.hull;

  const margin = 38;

  const w = (h.width + margin * 2) / zoom,

    ht = (h.height + margin * 2) / zoom;

  svg.setAttribute(

    "viewBox",

    `${h.width / 2 - w / 2} ${h.height / 2 - ht / 2} ${w} ${ht}`,

  );

  el("image", {

    href: project.image,

    x: 0,

    y: 0,

    width: h.width,

    height: h.height,

    preserveAspectRatio: "none",

  });

  el("line", {

    x1: h.center[0],

    y1: -20,

    x2: h.center[0],

    y2: h.height + 20,

    stroke: "#76968c",

    "stroke-width": 0.5,

    "stroke-dasharray": "3 4",

    "pointer-events": "none",

  });

  const s = current();

  if (s && val("editTool") === "weapons") {

    const p = toScreen(project, s.locations),

      r = 48;

    const a = polar(p, s.angle - s.arc / 2, r),

      b = polar(p, s.angle + s.arc / 2, r);

    if (s.arc >= 359.99)

      el("circle", {

        cx: p[0],

        cy: p[1],

        r,

        fill: "#69b8e51a",

        stroke: "#69b8e5",

        "stroke-width": 0.7,

        "pointer-events": "none",

      });

    else

      el("path", {

        d: `M ${p} L ${a} A ${r} ${r} 0 ${s.arc > 180 ? 1 : 0} 0 ${b} Z`,

        fill: "#69b8e51a",

        stroke: "#69b8e5",

        "stroke-width": 0.7,

        "pointer-events": "none",

      });

    for (const [kind, deg, col] of [

      ["aim", s.angle, "#65caff"],

      ["arc", s.angle + s.arc / 2, "#ffce70"],

    ] as const) {

      const q = polar(p, deg, r);

      el("line", {

        x1: p[0],

        y1: p[1],

        x2: q[0],

        y2: q[1],

        stroke: col,

        "stroke-width": 0.7,

        "pointer-events": "none",

      });

      el("circle", {

        cx: q[0],

        cy: q[1],

        r: 3,

        fill: col,

        "data-handle": kind,

        class: "arc-handle",

      });

    }

  }

  for (const slot of h.weaponSlots)

    for (const [positionIndex, position] of slotPoints(

      slot.locations,

    ).entries()) {

      const [x, y] = toScreen(project, position),

        r = slot.size === "LARGE" ? 6 : slot.size === "MEDIUM" ? 4.5 : 3;

      const g = el("g", {

        "data-slot": slot.id,

        "data-position": positionIndex,

        class: "weapon-marker",

      });

      el(

        slot.mount === "HARDPOINT" ? "rect" : "circle",

        slot.mount === "HARDPOINT"

          ? {

              x: x - r,

              y: y - r,

              width: r * 2,

              height: r * 2,

              rx: 1,

              fill: "#111c23",

              stroke: colors[slot.type] || "#aaa",

              "stroke-width": selected === slot.id ? 1.8 : 0.9,

            }

          : {

              cx: x,

              cy: y,

              r,

              fill: "#111c23",

              stroke: colors[slot.type] || "#aaa",

              "stroke-width": selected === slot.id ? 1.8 : 0.9,

            },

        g,

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

          "stroke-width": 0.7,

        },

        g,

      );

      if ($<HTMLInputElement>("showLabels").checked || slot.id === selected) {

        const t = el("text", { x: x + r + 2, y: y + 1.5 }, g);

        t.textContent = slot.id;

      }

    }

  geometry?.draw();

  $("zoomLabel").textContent = `${Math.round(zoom * 100)}%`;

  drawReferences(project);

}

function render() {
  rememberDrop();drawDropped();scheduleRecovery();

  const h = project.hull;

  set("name", h.hullName);

  set("hullId", h.hullId);

  set("class", h.hullSize);

  set("spritePath", h.spriteName);

  $("count").textContent = String(h.weaponSlots.length);

  $("dimensions").textContent =

    `${h.width.toFixed(0)} × ${h.height.toFixed(0)} units`;

  $("mountList").replaceChildren();

  for (const s of h.weaponSlots) {

    const b = document.createElement("button");

    b.textContent = s.id;

    b.className = s.id === selected ? "active" : "";
    b.type="button";b.dataset.mountId=s.id;b.setAttribute("aria-pressed",String(s.id===selected));

    const small = document.createElement("small");

    small.textContent = `${s.size} · ${s.type}`;

    b.append(small);

    b.onclick = () => {

      selected = s.id;

      render();

    };

    $("mountList").append(b);

  }

  studioUI.refresh(project,selected,session.dirty);
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

      arc: s.arc,

    }))

      set(id, value);

  }

  geometry?.render();

  const checks = validate(project);

  $("checks").replaceChildren();

  for (const [text, cls] of [

    ...checks.errors.map((x) => [x, "error"]),

    ...checks.warnings.map((x) => [x, "warning"]),

  ]) {

    const p = document.createElement("div");

    p.className = cls;

    p.textContent = text;

    $("checks").append(p);

  }

  if (!checks.errors.length && !checks.warnings.length)

    $("checks").textContent = "✓ Layout checks passed";

  $<HTMLButtonElement>("export").disabled = !!checks.errors.length;

  $<HTMLButtonElement>("undo").disabled = history.index === 0;

  $<HTMLButtonElement>("redo").disabled =

    history.index === history.items.length - 1;

  draw();

}

function load(p:Project,unsaved=false){
 gestures.finish();rememberDrop();if(droppedDesigns.length>=16)throw Error('Workspace limit is 16 ships. Right-click a design to close it first.');
 droppedDesigns.push(newDocument(p,unsaved));activateDocument(droppedDesigns.length-1);
 status('Loaded '+p.hull.hullName+' · '+p.hull.weaponSlots.length+' mounts');void autoOutline();scheduleRecovery();
}
function mayReplace(){gestures.finish();return true;}

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

function dataURL(blob: Blob): Promise<string> {

  return new Promise((resolve, reject) => {

    const r = new FileReader();

    r.onload = () => resolve(String(r.result));

    r.onerror = () => reject(Error("Unable to read file"));

    r.readAsDataURL(blob);

  });

}

async function readFile(file: File) {

  try {

    if (!mayReplace()) return;

    const ticket = session.beginLoad();

    const originalImage = project.image;

    if (file.size > 40_000_000) throw Error("File limit is 40 MB.");

    if (file.name.toLowerCase().endsWith(".png")) {

      const data = await dataURL(file);

      const image = new Image();

      image.src = data;

      await image.decode();

      if (image.width > 16384 || image.height > 16384)

        throw Error("Maximum image dimension is 16384 pixels.");

      const id =

        file.name.replace(/\.png$/i, "").replace(/[^a-zA-Z0-9_-]/g, "_") ||

        "new_ship";

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

            engineSlots: [],

          },

          data,

        ),
        true,
      );

      status("PNG loaded. Place mounts; artwork should face upward.");

    } else if (file.name.toLowerCase().endsWith(".ship")) {

      const p = fromShip(JSON.parse(await file.text()), originalImage);

      const result = validate(p);

      if (result.errors.length) throw Error(result.errors.join(" "));

      if (session.accepts(ticket)) {

        load(p,true);

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

function pick(accept: string) {

  const input = $<HTMLInputElement>("fileInput");

  input.accept = accept;

  input.value = "";

  input.onchange = () => {

    if (input.files?.[0]) void readFile(input.files[0]);

  };

  input.click();

}

async function save(name: string, text: string) {

  if (window.desktop) return window.desktop.save(name, text);

  const url = URL.createObjectURL(

    new Blob([text], { type: "application/json" }),

  );

  const a = document.createElement("a");

  a.href = url;

  a.download = name;

  a.click();

  setTimeout(() => URL.revokeObjectURL(url), 1000);

  return true;

}

on("save", () => {

  if (saveInFlight) return;

  saveInFlight = true;

  $<HTMLButtonElement>("save").disabled = true;

  const owner = session, document = droppedDesigns[activeDrop], ticket = owner.beginSave(),

    snapshot = clone(project);

  void save(

    `${snapshot.hull.hullId}.shipwright.json`,

    JSON.stringify(snapshot, null, 2),

  )

    .then((ok) => {

      if (ok) {

        owner.finishSave(ticket);

        if(owner===session)dirty=session.dirty;
        document.dirty=owner.dirty;

        rememberDrop();drawDropped();scheduleRecovery();

        status(

          dirty

            ? "Saved earlier revision; current edits remain unsaved."

            : "Project saved with embedded sprite.",

        );

      }

    })

    .catch((e) => status(String(e)))

    .finally(() => {

      saveInFlight = false;

      $<HTMLButtonElement>("save").disabled = false;

    });

});

let batchInFlight=false;
async function batchAction(mode:'save'|'ship'|'package'){
 if(batchInFlight)return;if(!window.desktop){status('Batch actions require the desktop app.');return;}
 batchInFlight=true;gestures.finish();await Promise.all(droppedDesigns.map(d=>autoOutline(d)));rememberDrop();for(const id of ['saveAll','exportAll','exportShipsAll'])$<HTMLButtonElement>(id).disabled=true;
 const entries=droppedDesigns.map(d=>({d,ticket:d.session.beginSave(),project:clone(d.project)}));
 try{
  for(const entry of entries){const errors=validate(entry.project).errors;if(errors.length)throw Error(entry.project.hull.hullName+': '+errors.join(' '));}
  const metadata=mode==='package'?await choosePackageMetadata('Shipwright design pack',true):undefined;if(metadata===false){status('Package export canceled.');return;}
  const payload=[];for(const entry of entries)payload.push({id:entry.d.id,project:entry.project,...(mode==='package'?{preview:await previewPNG(entry.project)}:{})});
  const result=await window.desktop.batch(payload,mode,metadata);if(!result){status('Batch cancelled; nothing marked saved.');return;}
  if(mode==='save')for(const r of result.results)if(r.ok){const entry=entries.find(e=>e.d.id===r.id)!;entry.d.session.finishSave(entry.ticket);entry.d.dirty=entry.d.session.dirty;}
  dirty=session.dirty;rememberDrop();drawDropped();scheduleRecovery();
  const failed=result.results.filter(r=>!r.ok);$('batchReport').hidden=false;$('batchReport').textContent=result.results.filter(r=>r.ok).length+' '+(mode==='save'?'saved':mode==='package'?'ships combined into one package':'exported')+', '+failed.length+' failed. '+result.directory+(failed.length?' — '+failed.map(r=>r.hullId+': '+r.error).join('; '):'');status($('batchReport').textContent!);
 }catch(error){status('Batch failed: '+error);}finally{batchInFlight=false;for(const id of ['saveAll','exportAll','exportShipsAll'])$<HTMLButtonElement>(id).disabled=false;}
}
on('saveAll',()=>void batchAction('save'));on('exportAll',()=>void batchAction('package'));on('exportShipsAll',()=>void batchAction('ship'));

on("export", () => {

  const hull = toShip(project);

  void save(`${hull.hullId}.ship`, JSON.stringify(hull, null, 2))

    .then((ok) => {

      if (ok)

        status("Layout exported. Keep the PNG at the specified sprite path.");

    })

    .catch((e) => status(String(e)));

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

  ["spritePath", "spriteName"],

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

  "arc",

])

  $(id).addEventListener("change", () => {

    const s = current();

    if (!s) return;

    const idValue = val("slotId");

    if (

      !idValue ||

      project.hull.weaponSlots.some((x) => x !== s && x.id === idValue)

    ) {

      status("Choose a unique, nonempty mount ID.");

      render();

      return;

    }

    const numbers = ["forward", "port", "angle", "arc"].map((x) =>

      Number(val(x)),

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

      mount: val("slotMount"),

    };

    gestures.finish();

    Object.assign(s, properties);

    selected = s.id;

    commit();

  });

on("resize", () => {

  const factor = Number(val("scale"));

  if (

    factor <= 0 ||

    factor > 10 ||

    project.hull.width * factor > 16384 ||

    project.hull.height * factor > 16384

  )

    throw Error(

      "Choose a scale greater than 0, at most 10, within 16384 units.",

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

    (x) => x.id !== selected,

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

  zoom = Math.min(8, zoom * 1.25);scheduleRecovery();

  draw();

});

on("zoomOut", () => {

  zoom = Math.max(0.25, zoom / 1.25);scheduleRecovery();

  draw();

});

on("fit", () => {

  zoom = 1;scheduleRecovery();

  draw();

});

for (const id of ["showBounds", "showShield", "showLabels"])

  $(id).addEventListener("change", draw);

let drag: {

  kind: string;

  id: string;

  start: Point;

  original: Locations;

  before: Project;

  moved: boolean;

} | null = null;

svg.addEventListener("pointerdown", (e) => {

  if (e.button !== 0) return;

  gestures.cancel();

  session.generation++;

  const target = e.target as Element;

  const handle = target.closest("[data-handle]")?.getAttribute("data-handle");

  const slotId = target.closest("[data-slot]")?.getAttribute("data-slot");

  if (handle && current()) {

    drag = {

      kind: handle,

      id: selected,

      start: point(e),

      original: clone(current()!.locations),

      before: clone(project),

      moved: false,

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

      start: point(e),

      original: clone(current()!.locations),

      before: clone(project),

      moved: false,

    };

    gestures.begin(e.pointerId, endWeapon);

    return;

  }

  if (placing) {

    const location = toGame(project, point(e)).map(

      (x) => Math.round(x * 10) / 10,

    ) as Point;

    const s: Slot = {

      id: nextId(project),

      locations: location,

      type: val("category"),

      size: val("size"),

      mount: val("mount"),

      angle: 0,

      arc: val("mount") === "HARDPOINT" ? 10 : 240,

    };

    project.hull.weaponSlots.push(s);

    if ($<HTMLInputElement>("symmetric").checked && Math.abs(location[1]) > 0.1)

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

  const s = project.hull.weaponSlots.find((x) => x.id === drag!.id);

  if (!s) return;

  const q = point(e);

  drag.moved = true;

  if (drag.kind === "move") {

    const origin = toScreen(project, drag.original);

    s.locations = moveSlot(

      drag.original,

      toGame(project, [

        origin[0] + q[0] - drag.start[0],

        origin[1] + q[1] - drag.start[1],

      ]).map((x) => Math.round(x * 10) / 10) as Point,

    );

  } else {

    const p = toScreen(project, s.locations);

    const angle = (Math.atan2(p[0] - q[0], p[1] - q[1]) * 180) / Math.PI;

    if (drag.kind === "aim") s.angle = Math.round(angle);

    else {

      s.arc = Math.min(

        360,

        Math.round(2 * Math.abs(((angle - s.angle + 540) % 360) - 180)),

      );

    }

  }

  draw();

});

function endWeapon(cancel: boolean) {

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

    zoom = Math.max(0.25, Math.min(8, zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1)));scheduleRecovery();

    draw();

  },

  { passive: false },

);

window.addEventListener("keydown", (e) => {

  if ((e.target as HTMLElement).matches("input,select,textarea")) return;

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
  if(allowClose)return;

  gestures.finish();

  rememberDrop();

  if (dirty || droppedDesigns.some(d=>d.dirty)) {

    e.preventDefault();

    e.returnValue = "";

  }

});

window.addEventListener("dragover",(event)=>{event.preventDefault();if(event.dataTransfer?.types.includes("Files")){event.dataTransfer.dropEffect="copy";document.body.classList.add("file-drag");}});

window.addEventListener("dragleave",(event)=>{if(!event.relatedTarget)document.body.classList.remove("file-drag");});

window.addEventListener("drop",(event)=>{

 event.preventDefault();document.body.classList.remove("file-drag");const files=Array.from(event.dataTransfer?.files||[]);

 if(!files.length)return;

 if(files.every(f=>f.name.toLowerCase().endsWith(".png")))void dropPNGs(files);

 else if(files.length===1&&/\.(ship|json)$/i.test(files[0].name))void readFile(files[0]);

 else status("Drop failed: drop a PNG batch, or one .ship / .shipwright.json file.");

});

void restoreWorkspace();

new ResizeObserver(() => {

  if (project) drawReferences(project);

}).observe($("viewport"));

void loadReference()

  .then(() => {

    if (project) draw();

  })

  .catch(() =>

    status("Class references unavailable; ship editing is unaffected."),

  );

on("compareScale", () => {

  drawReferences(project);

  $<HTMLDialogElement>("comparisonDialog").showModal();

});

on("closeComparison", () => $<HTMLDialogElement>("comparisonDialog").close());

$("referenceClass").addEventListener("change", () => drawReferences(project));

const geometry = installGeometry({

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

  },

});

installShipLibrary({

  mayReplace,

  begin: () => session.beginLoad(),

  accepts: (t) => session.accepts(t),

  open: (p) => {

    load(p,true);

    status(

      `Opened editable copy: ${p.hull.hullName}. Save your project to keep edits.`,

    );

  },

});

