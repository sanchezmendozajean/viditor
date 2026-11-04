/** Timecode no-drop `HH:MM:SS:FF` a partir de segundos. */
export function formatTimecode(t: number, fpsNum: number, fpsDen: number): string {
  const fps = Math.max(1, Math.round(fpsNum / fpsDen))
  const total = Math.max(0, Math.round((t * fpsNum) / fpsDen))
  const ff = total % fps
  const s = Math.floor(total / fps)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}:${pad(ff)}`
}

/** Interpreta `HH:MM:SS:FF`, `MM:SS:FF`, `SS:FF` o un número de segundos. Devuelve null si no es válido. */
export function parseTimecode(text: string, fpsNum: number, fpsDen: number): number | null {
  const s = text.trim()
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s)
  if (!/^\d+(:\d+){1,3}$/.test(s)) return null
  const parts = s.split(':').map(Number)
  const fps = Math.max(1, Math.round(fpsNum / fpsDen))
  const ff = parts.pop() ?? 0
  let secs = 0
  for (const p of parts) secs = secs * 60 + p
  return (secs * fps + ff) * (fpsDen / fpsNum)
}
