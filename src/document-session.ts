let documentSequence=0;
export class DocumentSession {
  document = 0;
  revision = 0;
  saved = 0;
  generation = 0;
  private sequence = 0;
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
  restore(revision: number) {
    this.revision = revision;
    this.generation++;
  }
  beginLoad() {
    return {
      generation: ++this.generation,
      document: this.document,
      revision: this.revision,
    };
  }
  accepts(ticket: { generation: number; document: number; revision: number }) {
    return (
      ticket.generation === this.generation &&
      ticket.document === this.document &&
      ticket.revision === this.revision
    );
  }
  beginSave() {
    return { document: this.document, revision: this.revision };
  }
  // The renderer serializes saves. Undo revisions are not save-operation order.
  finishSave(ticket: { document: number; revision: number }) {
    if (ticket.document === this.document) this.saved = ticket.revision;
  }
}
