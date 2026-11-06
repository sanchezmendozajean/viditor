/**
 * Combinaciones de teclas (atajos). Forma canónica: modificadores en orden `Ctrl+Alt+Shift+` y luego la tecla:
 * `Ctrl+Shift+Z`, `Space`, `Delete`, `ArrowLeft`, `F1`, `+`. Ctrl y Cmd cuentan como `Ctrl`.
 */
export interface KeyLike {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  shiftKey: boolean
}

const MODIFIER_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta', 'AltGraph', 'CapsLock'])

export function comboFromEvent(e: KeyLike): string | null {
  if (MODIFIER_KEYS.has(e.key)) return null
  let key = e.key === ' ' ? 'Space' : e.key
  let shift = e.shiftKey
  if (key.length === 1) {
    if (/[a-z]/i.test(key)) key = key.toUpperCase()
    else if (!/[0-9]/.test(key)) shift = false // símbolos: Mayús ya va incluida en el carácter (+, ?, …)
  }
  return [e.ctrlKey || e.metaKey ? 'Ctrl' : '', e.altKey ? 'Alt' : '', shift ? 'Shift' : '', key].filter(Boolean).join('+')
}

/** Normaliza una combinación escrita a mano (`ctrl+shift+z`, `Mayús+E`) a la forma canónica; null si no es válida. */
export function normalizeCombo(text: string): string | null {
  const parts = text.split('+').map((s) => s.trim())
  // Un "+" final vacío significa la tecla "+" (p. ej. `Ctrl++`)
  if (parts.length >= 2 && parts.at(-1) === '' && parts.at(-2) === '') {
    parts.length -= 2
    parts.push('+')
  }
  let ctrl = false
  let alt = false
  let shift = false
  let key = ''
  for (const part of parts) {
    const low = part.toLowerCase()
    if (low === 'ctrl' || low === 'control' || low === 'cmd' || low === 'meta') ctrl = true
    else if (low === 'alt') alt = true
    else if (low === 'shift' || low === 'mayús' || low === 'mayus') shift = true
    else if (key === '' && part) key = part
    else return null
  }
  if (!key) return null
  if (key.length === 1 && /[a-z]/i.test(key)) key = key.toUpperCase()
  return [ctrl ? 'Ctrl' : '', alt ? 'Alt' : '', shift ? 'Shift' : '', key].filter(Boolean).join('+')
}

const NAMES: Record<string, string> = {
  Space: 'Espacio',
  Delete: 'Supr',
  Backspace: 'Retroceso',
  Escape: 'Esc',
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
  Enter: 'Intro',
  Shift: 'Mayús'
}

/** Texto para mostrar en menús y en la guía (`Ctrl+Mayús+Z`, `Supr`, `←`). */
export function formatCombo(combo: string): string {
  const parts = combo.endsWith('++') ? [...combo.slice(0, -2).split('+'), '+'] : combo.split('+')
  return parts.map((p) => NAMES[p] ?? p).join('+')
}
