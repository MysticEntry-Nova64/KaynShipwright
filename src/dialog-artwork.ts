/** Fixed decorative art follows the dialog state; it never reads preferences. */
export function installDialogArtwork() {
  for (const image of document.querySelectorAll<HTMLImageElement>('img[data-dialog-artwork]')) {
    const fallback = document.getElementById(image.dataset.dialogArtwork!)!;
    const container = image.closest('picture') ?? image;
    const refresh = () => {
      const unavailable = image.complete && image.naturalWidth === 0;
      (container as HTMLElement).hidden = unavailable;
      fallback.hidden = !unavailable;
    };
    image.addEventListener('load', refresh);
    image.addEventListener('error', refresh);
    refresh();
  }
}
