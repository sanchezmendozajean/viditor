import { describe, expect, it } from 'vitest'
import { parseRange } from '../../src/shared/http-range'

describe('parseRange', () => {
  it('rangos cerrados, abiertos y de sufijo', () => {
    expect(parseRange('bytes=0-99', 1000)).toEqual({ start: 0, end: 99, size: 1000 })
    expect(parseRange('bytes=900-', 1000)).toEqual({ start: 900, end: 999, size: 1000 })
    expect(parseRange('bytes=-100', 1000)).toEqual({ start: 900, end: 999, size: 1000 })
    expect(parseRange('bytes=900-5000', 1000)).toEqual({ start: 900, end: 999, size: 1000 })
  })
  it('sin cabecera o inválido → null', () => {
    expect(parseRange(null, 1000)).toBeNull()
    expect(parseRange('bytes=2000-3000', 1000)).toBeNull()
    expect(parseRange('items=0-1', 1000)).toBeNull()
    expect(parseRange('bytes=0-1', 0)).toBeNull()
  })
})
