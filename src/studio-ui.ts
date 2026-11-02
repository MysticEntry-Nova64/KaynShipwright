import type { Project } from './core';

interface ExportState { names: string[]; mounts: number; errors: string[] }
interface Host {
  selectMount: (id: string) => void;
  layoutChanged: () => void;
  exportState: (scope: string) => ExportState;
}

/** One controller per window. The host owns editing, history, IO and export. */
export function installStudioUI(host: Host) {
  const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
  const layout = $<HTMLSelectElement>('layoutMode');
  const focus = $<HTMLSelectElement>('focusMount');
  const search = $<HTMLInputElement>('mountSearch');
  const tool = $<HTMLSelectElement>('editTool');
  const focusTool = $<HTMLSelectElement>('focusTool');
  const preference = 'shipwright.studio.layout.v1';

  focusTool.addEventListener('change', () => {
    tool.value = focusTool.value;
    tool.dispatchEvent(new Event('change', { bubbles: true }));
  });
  tool.addEventListener('change', () => { focusTool.value = tool.value; });
  let saved: string | null = null;
  try { saved = localStorage.getItem(preference); }
  catch { /* Preferences are optional; editing remains available. */ }
  layout.value = saved === 'focus' ? 'focus' : 'studio';
  function applyLayout() { document.body.dataset.layout = layout.value; }
  applyLayout();
  layout.addEventListener('change', () => {
    applyLayout();
    try { localStorage.setItem(preference, layout.value); }
    catch { /* Keep the chosen layout for this window. */ }
    host.layoutChanged();
  });
  focus.addEventListener('change', () => host.selectMount(focus.value));

  function filter() {
    let visible = 0;
    const query = search.value.trim().toLowerCase();
    for (const button of Array.from($('mountList').querySelectorAll<HTMLButtonElement>('button'))) {
      button.hidden = !(button.textContent ?? '').toLowerCase().includes(query);
      if (!button.hidden) visible++;
    }
    $('mountSearchEmpty').hidden = visible > 0 || !query;
  }
  search.addEventListener('input', filter);

  const menus = ['openMenu', 'moreMenu'].map(id => $<HTMLDetailsElement>(id));
  for (const menu of menus) {
    menu.addEventListener('toggle', () => {
      if (menu.open) for (const other of menus) if (other !== menu) other.open = false;
    });
    menu.querySelectorAll('button').forEach(button =>
      button.addEventListener('click', () => { menu.open = false; }));
  }
  document.addEventListener('pointerdown', event => {
    for (const menu of menus) if (!menu.contains(event.target as Node)) menu.open = false;
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') for (const menu of menus) if (menu.open) {
      menu.open = false;
      menu.querySelector('summary')?.focus();
    }
  });

  const review = $<HTMLDialogElement>('exportReviewDialog');
  const scope = $<HTMLSelectElement>('exportReviewScope');
  const format = $<HTMLSelectElement>('exportReviewFormat');
  const continueExport = $<HTMLButtonElement>('exportReviewContinue');
  function reviewState() {
    const state = host.exportState(scope.value);
    $('exportReviewSummary').textContent = state.names.join(', ') + ' · ' + state.mounts + ' weapon mounts';
    $('exportReviewChecks').textContent = state.errors.length
      ? state.errors.join('\n') : '✓ Layout checks passed for the selected scope.';
    $('exportReviewChecks').className = state.errors.length ? 'error' : '';
    continueExport.disabled = !!state.errors.length;
    $('exportReviewNext').textContent = format.value === 'package'
      ? 'Next: choose the package name/version, then its destination folder.'
      : 'Next: choose the layout file destination' + (scope.value === 'all' ? ' folder.' : '.');
  }
  $('reviewExport').addEventListener('click', () => {
    reviewState(); review.showModal(); continueExport.focus();
  });
  $('exportReviewClose').addEventListener('click', () => review.close());
  scope.addEventListener('change', reviewState);
  format.addEventListener('change', reviewState);
  continueExport.addEventListener('click', () => {
    reviewState();
    if (continueExport.disabled) return;
    const id = format.value === 'package'
      ? (scope.value === 'all' ? 'exportAll' : 'exportPackage')
      : (scope.value === 'all' ? 'exportShipsAll' : 'export');
    review.close();
    // Delegate to the original operation so snapshot and publication rules hold.
    $<HTMLButtonElement>(id).click();
  });

  function fileState(dirty: boolean) {
    $('projectFileState').textContent = dirty
      ? '● Unsaved changes — save a project copy'
      : 'No new edits — recovery is separate from a project file';
    $('projectFileState').dataset.dirty = String(dirty);
  }
  return {
    fileState,
    refresh(project: Project, selected: string, dirty: boolean) {
      focus.replaceChildren(...project.hull.weaponSlots.map(slot => {
        const option = document.createElement('option');
        option.value = slot.id;
        option.textContent = slot.id + ' · ' + slot.size.toLowerCase() + ' ' + slot.type.toLowerCase();
        return option;
      }));
      if (selected) focus.value = selected;
      else focus.selectedIndex = -1;
      focus.disabled = !project.hull.weaponSlots.length;
      $('selectionSummary').textContent = selected ? '· ' + selected : '';
      $('objectBrowser').hidden = tool.value !== 'weapons';
      (focus.closest('.focus-picker') as HTMLElement).hidden = tool.value !== 'weapons';
      focusTool.value = tool.value;
      fileState(dirty); filter();
    },
  };
}
