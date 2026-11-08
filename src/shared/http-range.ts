/** Interpreta la cabecera `Range: bytes=a-b` (también `a-` y `-n`) sobre un archivo de `size` bytes. */
export function parseRange(header: string | null, size: number): { start: number; end: number; size: number } | null {
  if (!header || size <= 0) return null
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!m || (m[1] === '' && m[2] === '')) return null
  let start: number
  let end: number
  if (m[1] === '') {
    start = Math.max(0, size - Number(m[2]))
    end = size - 1
  } else {
    start = Number(m[1])
    end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1)
  }
  if (start > end || start >= size) return null
  return { start, end, size }
}
