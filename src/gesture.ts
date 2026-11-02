// One owner for pointer capture and gesture completion across every canvas tool.
export class GestureController {
  private active: { pointerId: number; end: (cancel: boolean) => void } | null =
    null;
  constructor(private svg: SVGSVGElement) {
    svg.addEventListener(
      "pointerup",
      (e) => {
        if (this.owns(e.pointerId)) this.finish();
      },
      true,
    );
    svg.addEventListener(
      "pointercancel",
      (e) => {
        if (this.owns(e.pointerId)) this.cancel();
      },
      true,
    );
    svg.addEventListener("lostpointercapture", (e) => {
      if (this.owns(e.pointerId)) this.cancel();
    });
    window.addEventListener(
      "keydown",
      (e) => {
        if (e.key === "Escape") this.cancel();
      },
      true,
    );
    window.addEventListener("blur", () => this.cancel());
  }
  owns(pointerId: number) {
    return this.active?.pointerId === pointerId;
  }
  begin(pointerId: number, end: (cancel: boolean) => void) {
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
}
