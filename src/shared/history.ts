/** Pila de deshacer/rehacer basada en instantáneas antes/después (sin límite, specs/04). */
export interface Entry<S> {
  label: string
  before: S
  after: S
}

export class History<S> {
  private undoStack: Entry<S>[] = []
  private redoStack: Entry<S>[] = []

  get canUndo(): boolean {
    return this.undoStack.length > 0
  }
  get canRedo(): boolean {
    return this.redoStack.length > 0
  }
  get undoLabel(): string | null {
    return this.undoStack.at(-1)?.label ?? null
  }
  get redoLabel(): string | null {
    return this.redoStack.at(-1)?.label ?? null
  }

  push(entry: Entry<S>): void {
    this.undoStack.push(entry)
    this.redoStack = []
  }
  /** Devuelve el estado al que volver, o null. */
  undo(): S | null {
    const e = this.undoStack.pop()
    if (!e) return null
    this.redoStack.push(e)
    return e.before
  }
  redo(): S | null {
    const e = this.redoStack.pop()
    if (!e) return null
    this.undoStack.push(e)
    return e.after
  }
  clear(): void {
    this.undoStack = []
    this.redoStack = []
  }
}
