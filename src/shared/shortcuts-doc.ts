import { COMMANDS, type CommandCategory } from './commands-meta'
import { formatCombo } from './keys'

const ORDER: CommandCategory[] = ['Archivo', 'Edición', 'Reproducción', 'Línea de tiempo', 'Fotogramas clave', 'Ver', 'Ayuda']

/** Página «Atajos de teclado» de la guía, generada desde el catálogo de comandos (única fuente de verdad). */
export function shortcutsMarkdown(): string {
  const out: string[] = [
    '# Atajos de teclado',
    '',
    '::: info Generado',
    'Esta tabla se genera desde el catálogo de comandos de la aplicación. Todos los atajos se pueden cambiar en **Preferencias › Atajos de teclado** (`Ctrl+,`), y todos los comandos —también los que no tienen atajo— están en la **paleta de comandos** (`Ctrl+Mayús+P`).',
    ':::',
    ''
  ]
  for (const cat of ORDER) {
    const rows = COMMANDS.filter((c) => c.category === cat)
    if (rows.length === 0) continue
    out.push(`## ${cat}`, '', '| Atajo | Acción |', '|-------|--------|')
    for (const c of rows) {
      const keys = c.keys?.length ? c.keys.map((k) => `\`${formatCombo(k).replace(/\|/g, '\\|')}\``).join(' / ') : '—'
      out.push(`| ${keys} | ${c.label} |`)
    }
    out.push('')
  }
  return out.join('\n')
}
