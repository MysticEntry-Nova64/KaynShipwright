import { clone, validate } from "./core";
import type { Project } from "./core";
import type { SourceSummary } from "./desktop-api";
type Ticket = { generation: number; document: number; revision: number };
interface Host {
  mayReplace: () => boolean;
  begin: () => Ticket;
  accepts: (ticket: Ticket) => boolean;
  open: (project: Project) => void;
}
type Source = SourceSummary;
export function installShipLibrary(host: Host) {
  const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
    document.getElementById(id) as T;
  const dialog = $<HTMLDialogElement>("importDialog"),
    message = (text: string) => {
      $("importStatus").textContent = text;
    };
  let sources: Source[] = [],
    selected: Source | undefined,
    busy = false,
    selectedReady = false,
    previewGeneration = 0;
  let sourceChosen = false;
  function updateGuide() {
    $("importEmptyGuide").hidden = sourceChosen;
    $("importSources").hidden = !sourceChosen;
  }
  function controls() {
    for (const id of ["importChooseRoot", "importChooseShip"])
      $<HTMLButtonElement>(id).disabled = busy;
    $<HTMLButtonElement>("importAdd").disabled =
      busy || !selected || !!selected.error || !selectedReady;
    for (const b of dialog.querySelectorAll<HTMLButtonElement>(
      "[data-source],[data-library]",
    ))
      b.disabled = busy || !!b.dataset.invalid;
  }
  async function action(work: () => Promise<void>) {
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
  function row(text: string, detail: string) {
    const b = document.createElement("button");
    b.type = "button";
    b.append(document.createTextNode(text));
    const small = document.createElement("small");
    small.textContent = detail;
    b.append(small);
    return b;
  }
  function renderSources() {
    const list = $("importSources");
    list.replaceChildren();
    const query = $<HTMLInputElement>("importSearch").value.toLowerCase();
    for (const entry of sources.filter((s) =>
      `${s.name} ${s.hullId} ${s.source}`.toLowerCase().includes(query),
    )) {
      const b = row(
        entry.name,
        `${entry.source} · ${entry.hullSize} · ${entry.hullId}${entry.error ? " · " + entry.error : ""}`,
      );
      b.dataset.source = entry.id;
      if (entry.error) b.dataset.invalid = "true";
      b.onclick = () =>
        void action(async () => {
          selected = entry;
          selectedReady = false;
          const generation = ++previewGeneration;
          $("importPreviewName").textContent = entry.name;
          $("importSourceDetails").textContent =
            `${entry.source} · ${entry.hullSize} · ${entry.hullId}`;
          $("importPreview").hidden = true;
          message("Loading sprite preview…");
          try {
            const result = await window.desktop!.previewShip(entry.id);
            if (generation !== previewGeneration) return;
            selectedReady = !result.issues.length;
            if (result.needsSprite) {
              message(
                `${result.message} Add to library to choose the matching PNG.`,
              );
              return;
            }
            const img = $<HTMLImageElement>("importPreview");
            img.src = result.image!;
            await img.decode();
            if (generation !== previewGeneration || !dialog.open) return;
            img.hidden = false;
            message(
              result.issues.length
                ? "Preview available. Editing requires resolving: " +
                    result.issues.join(" ")
                : "Ready to add an independent copy to your library.",
            );
          } catch (e) {
            selectedReady = false;
            message(String(e));
          }
        });
      list.append(b);
    }
    if (!list.children.length)
      list.textContent = sources.length
        ? "No matching ships."
        : sourceChosen
          ? "No ship files in the current source list. Browse another folder to see more ships."
          : "";
    updateGuide();
    controls();
  }
  async function refreshLibrary() {
    const result = await window.desktop!.libraryList(),
      list = $("importLibrary");
    list.replaceChildren();
    for (const entry of result.entries) {
      const b = row(
        `Open copy: ${entry.name}`,
        `${entry.source} · ${entry.hullSize} · ${entry.hullId}`,
      );
      b.dataset.library = entry.id;
      b.onclick = () =>
        void action(async () => {
          if (!host.mayReplace()) return;
          const ticket = host.begin(),
            name = $<HTMLInputElement>("importCopyName").value.trim(),
            id = $<HTMLInputElement>("importCopyId").value.trim();
          const project = clone(await window.desktop!.libraryGet(entry.id));
          project.hull.hullName = name || `${project.hull.hullName} (copy)`;
          project.hull.hullId =
            id || `${project.hull.hullId.slice(0, 180)}_copy`;
          project.hull.spriteName = `graphics/ships/${project.hull.hullId}.png`;
          const errors = validate(project).errors;
          if (errors.length) throw Error(errors.join("\n"));
          const image = new Image();
          image.src = project.image;
          await image.decode();
          if (!host.accepts(ticket)) {
            message(
              "The project changed while loading. Open the library copy again when ready.",
            );
            return;
          }
          if (!dialog.open) {
            message("Opening canceled. Your current project is unchanged.");
            return;
          }
          sourceChosen = true;
          renderSources();
          host.open(project);
          dialog.close();
        });
      list.append(b);
    }
    if (!result.entries.length) list.textContent = "No imported ships yet.";
    if (result.warnings.length)
      message(
        "Some saved entries could not be read: " + result.warnings.join("; "),
      );
    controls();
  }
  async function add(id?: string) {
    const result = await window.desktop!.importShip(id);
    if (!result) {
      message("Import canceled. No library or project changes.");
      return;
    }
    sourceChosen = true;
    renderSources();
    await refreshLibrary();
    message(
      result.duplicate
        ? "This exact source is already in your library."
        : "Added to your library. Open a copy below to edit it.",
    );
  }
  $("starsectorImport").onclick = () => {
    dialog.showModal();
    if (!window.desktop) {
      message("Starsector import requires the desktop app.");
      return;
    }
    void action(refreshLibrary);
  };
  $("importClose").onclick = () => dialog.close();
  dialog.addEventListener("close", () => {
    ++previewGeneration;
    const image = $<HTMLImageElement>("importPreview");
    image.hidden = true;
    image.removeAttribute("src");
  });
  $("importChooseRoot").onclick = () =>
    void action(async () => {
      message("Looking for ship files…");
      const result = await window.desktop!.scanShips();
      if (!result) {
        message("Folder selection canceled.");
        return;
      }
      sources = result;
      sourceChosen = true;
      selected = undefined;
      ++previewGeneration;
      $("importPreview").hidden = true;
      $("importPreviewName").textContent = "Select a ship to preview";
      renderSources();
      message(`Found ${sources.length} ship files. Select one to preview.`);
    });
  $("importChooseShip").onclick = () => void action(() => add());
  $("importAdd").onclick = () => void action(() => add(selected?.id));
  $("importSearch").oninput = renderSources;
  renderSources();
}
