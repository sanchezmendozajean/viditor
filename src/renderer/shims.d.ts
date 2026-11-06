// Declaraciones ambientales (sin imports, para que no sean aumentos de módulo)

declare module 'monaco-editor/language/typescript/monaco.contribution.js' {
  export const ScriptTarget: { ES2022: number }
  export const javascriptDefaults: {
    setCompilerOptions(options: Record<string, unknown>): void
    setDiagnosticsOptions(options: Record<string, unknown>): void
    setEagerModelSync(value: boolean): void
    addExtraLib(content: string, path?: string): unknown
  }
}
