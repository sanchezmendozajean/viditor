import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TransitionError, TransitionInstance, readMeta, resolveParams } from '../../src/transition-runtime/runtime'
import type { LayerItem, ShapeItem } from '../../src/shared/display-list'

const EJ = join(__dirname, '../../specs/transiciones/ejemplos')
const load = (name: string, params?: Record<string, unknown>, seed = 1): TransitionInstance => {
  const t = new TransitionInstance(readFileSync(join(EJ, `${name}.js`), 'utf8'), { width: 1920, height: 1080, fps: 30, duration: 1, params, seed })
  t.init()
  return t
}
const layers = (items: unknown[]): LayerItem[] => items.filter((i) => (i as LayerItem).kind === 'layer') as LayerItem[]
const META = 'const meta={apiVersion:1,id:"t",name:"T"};'

describe('ejemplos de specs/transiciones/ejemplos funcionan sin cambios', () => {
  for (const file of readdirSync(EJ).filter((f) => f.endsWith('.js'))) {
    it(file, () => {
      const t = new TransitionInstance(readFileSync(join(EJ, file), 'utf8'), { width: 1920, height: 1080, fps: 30, duration: 1 })
      t.init()
      for (let i = 0; i <= 10; i++) {
        const dl = t.render(i / 10, i, 11)
        expect(dl.items.length).toBeGreaterThan(0)
        expect(JSON.parse(JSON.stringify(dl))).toEqual(dl) // serializable
      }
    })
  }
})

describe('semántica de la API', () => {
  it('slide-horizontal: mueve saliente y entrante en sentidos coherentes', () => {
    const t = load('slide-horizontal', { easing: 'linear', direction: 'derecha' })
    const [enter, leave] = layers(t.render(0.5).items) // enter z=0, leave z=1
    expect(enter!.source).toBe('enter')
    expect(leave!.matrix[4]).toBeCloseTo(960) // el saliente se desplaza media pantalla
    expect(enter!.matrix[4]).toBeCloseTo(-960) // el entrante viene desde la izquierda
    const left = load('slide-horizontal', { easing: 'linear', direction: 'izquierda' }).render(0.5)
    expect(layers(left.items)[1]!.matrix[4]).toBeCloseTo(-960)
  })

  it('crossfade: alpha complementaria', () => {
    const t = load('crossfade')
    const [enter, leave] = layers(t.render(0.25).items)
    expect(leave!.opacity).toBeCloseTo(0.75)
    expect(enter!.opacity).toBeCloseTo(0.25)
  })

  it('regla de oro: cada frame empieza desde cero (scrubbing hacia atrás = hacia delante)', () => {
    const a = load('slide-horizontal')
    const b = load('slide-horizontal')
    a.render(0.9)
    a.render(0.3)
    expect(a.render(0.1)).toEqual(b.render(0.1))
  })

  it('dentro de un mismo frame las llamadas se componen en orden', () => {
    const src = `${META} function render(l,e,p){ l.move(10,0).move(5,2).scale(2).scale(0.5).alpha(0.5).alpha(0.5); }`
    const t = new TransitionInstance(src)
    t.init()
    const leave = layers(t.render(0.5).items).find((i) => i.source === 'leave')!
    expect(leave.matrix[4]).toBeCloseTo(15)
    expect(leave.matrix[5]).toBeCloseTo(2)
    expect(leave.matrix[0]).toBeCloseTo(1)
    expect(leave.opacity).toBeCloseTo(0.25)
  })

  it('orden de aplicación: rotación sobre el pivote y luego traslación', () => {
    const src = `${META} function render(l,e,p){ l.pivot(0,0).rotate(90).move(100,0); }`
    const t = new TransitionInstance(src, { width: 200, height: 100, fps: 30, duration: 1 })
    t.init()
    const m = layers(t.render(0).items).find((i) => i.source === 'leave')!.matrix
    // El punto (1,0) rota 90° a (0,1) y se traslada +100 en x
    expect(m[0] * 1 + m[2] * 0 + m[4]).toBeCloseTo(100)
    expect(m[1] * 1 + m[3] * 0 + m[5]).toBeCloseTo(1)
  })

  it('z reordena el dibujo; las figuras usadas como máscara no se dibujan', () => {
    const dip = load('dip-to-black').render(0.25)
    expect(dip.items.map((i) => i.kind)).toEqual(['layer', 'shape']) // enter oculto en la 1ª mitad
    const iris = load('iris-circle').render(0.5)
    expect(iris.items[0]!.kind).toBe('layer')
    expect(iris.masks).toHaveLength(1)
    expect(iris.masks[0]!.geometry.type).toBe('circle')
    expect(iris.items.some((i) => i.kind === 'shape')).toBe(false)
    expect((layers(iris.items).find((i) => i.source === 'enter') as LayerItem).mask).toBe('m0')
    // enterClip.z(2) lo dibuja por encima del saliente (z=1)
    expect(layers(iris.items).map((i) => i.source)).toEqual(['leave', 'enter'])
  })

  it('splitGrid: las partes sustituyen a la capa original y se reutilizan entre frames', () => {
    const t = load('grid-shrink', { cols: 4, rows: 3, stagger: 0.5 })
    const dl = t.render(0.5)
    const leave = layers(dl.items).filter((i) => i.source === 'leave')
    expect(leave).toHaveLength(12)
    expect(leave.every((i) => i.rect !== undefined)).toBe(true)
    expect(leave[0]!.rect).toEqual({ x: 0, y: 0, w: 480, h: 360 })
    expect(layers(dl.items).filter((i) => i.source === 'enter')).toHaveLength(1)
    expect(layers(t.render(0).items).filter((i) => i.source === 'leave')[3]!.matrix[0]).toBeCloseTo(1)
    expect(layers(t.render(1).items).filter((i) => i.source === 'leave')[11]!.matrix[0]).toBeCloseTo(0)
  })

  it('ctx.random es determinista por semilla y se reinicia en cada render', () => {
    const src = `${META} function render(l,e,p,ctx){ l.move(ctx.random()*1000, ctx.random()*1000); }`
    const mk = (seed: number): TransitionInstance => {
      const t = new TransitionInstance(src, { width: 100, height: 100, fps: 30, duration: 1, seed })
      t.init()
      return t
    }
    const a = mk(7)
    expect(a.render(0.2)).toEqual(a.render(0.8))
    expect(mk(7).render(0.5)).toEqual(mk(7).render(0.5))
    expect(mk(7).render(0.5)).not.toEqual(mk(8).render(0.5))
  })

  it('stagger, easing y math', () => {
    const t = new TransitionInstance(`${META} function render(l,e,p){ l.move(math.stagger(1,3,p,0), ease.inQuad(p) * 100 + math.lerp(0,10,0.5) + math.clamp(5,0,2)); }`)
    t.init()
    const m = layers(t.render(0.5).items).find((i) => i.source === 'leave')!.matrix
    expect(m[4]).toBeCloseTo((0.5 - 1 / 3) * 3) // stagger secuencial: elemento 1 de 3
    expect(m[5]).toBeCloseTo(25 + 5 + 2)
  })

  it('meta, parámetros por defecto y coerción', () => {
    const meta = readMeta(readFileSync(join(EJ, 'grid-shrink.js'), 'utf8'))
    expect(meta.id).toBe('grid-shrink')
    expect(meta.params.cols).toMatchObject({ type: 'int', default: 4 })
    expect(meta.defaultDuration).toBe(1)
    expect(resolveParams(meta.params, { cols: 99, rows: 2.6, stagger: 'x' })).toEqual({ cols: 32, rows: 3, stagger: 0.5 })
    expect(resolveParams({ d: { type: 'enum', options: ['a', 'b'], default: 'a' } }, { d: 'zzz' })).toEqual({ d: 'a' })
  })

  it('hasLeave = false omite la capa ausente', () => {
    const t = new TransitionInstance(readFileSync(join(EJ, 'crossfade.js'), 'utf8'), { width: 100, height: 100, fps: 30, duration: 1, hasLeave: false })
    t.init()
    expect(layers(t.render(0.5).items).map((i) => i.source)).toEqual(['enter'])
  })
})

describe('errores y sandbox', () => {
  const bad = (src: string, phase: 'load' | 'init' | 'render'): TransitionError => {
    try {
      const t = new TransitionInstance(src)
      t.init()
      t.render(0.5)
    } catch (e) {
      expect(e).toBeInstanceOf(TransitionError)
      expect((e as TransitionError).phase).toBe(phase)
      return e as TransitionError
    }
    throw new Error('debía fallar')
  }

  it('error de sintaxis con número de línea', () => {
    const e = bad(`${META}\nfunction render(l, e, p) {\n  l.move(1 2)\n}`, 'load')
    expect(e.line).toBe(3)
  })

  it('error en tiempo de ejecución con el número de línea del archivo del usuario', () => {
    const e = bad(`${META}\n\nfunction render(l, e, p) {\n  l.noExiste();\n}`, 'render')
    expect(e.message).toMatch(/noExiste/)
    expect(e.line).toBe(4)
  })

  it('meta inválido o ausente', () => {
    expect(() => new TransitionInstance('function render(){}')).toThrow(/meta/)
    expect(() => new TransitionInstance('const meta={apiVersion:2,id:"x",name:"x"};function render(){}')).toThrow(/apiVersion/)
    expect(() => new TransitionInstance('const meta={apiVersion:1,id:"Mal Id",name:"x"};function render(){}')).toThrow(/id/)
    expect(() => new TransitionInstance('const meta={apiVersion:1,id:"x",name:"x"};')).toThrow(/render/)
  })

  it('Math.random, Date, fetch y globalThis están deshabilitados', () => {
    const wrap = (body: string): string => `${META} function render(l,e,p){ ${body} }`
    expect(bad(wrap('Math.random()'), 'render').message).toMatch(/ctx\.random/)
    expect(bad(wrap('new Date()'), 'render').message).toMatch(/Date/)
    expect(bad(wrap('fetch("http://x")'), 'render').message).toMatch(/fetch|undefined|not a function/)
    expect(bad(wrap('globalThis.x = 1'), 'render').message).toMatch(/undefined|globalThis/)
    const ok = new TransitionInstance(wrap('l.move(Math.hypot(3,4), Math.PI);'))
    ok.init()
    expect(layers(ok.render(0).items).find((i) => i.source === 'leave')!.matrix[4]).toBeCloseTo(5)
  })

  it('límites de partes y figuras', () => {
    const wrap = (init: string, render = ''): string => `${META} function init(l,e){ ${init} } function render(l,e,p){ ${render} }`
    expect(bad(wrap('l.splitGrid(100, 100);'), 'init').message).toMatch(/4096/)
    expect(bad(wrap('', 'for (let i=0;i<10001;i++) draw.circle(0,0,1);'), 'render').message).toMatch(/10000/)
  })

  it('cada instancia tiene su propio estado de nivel superior', () => {
    const src = `${META} let n = 0; function init(){ n = 5 } function render(l,e,p){ l.move(n,0) }`
    const a = new TransitionInstance(src)
    const b = new TransitionInstance(src)
    a.init()
    expect(layers(a.render(0).items).find((i) => i.source === 'leave')!.matrix[4]).toBe(5)
    expect(layers(b.render(0).items).find((i) => i.source === 'leave')!.matrix[4]).toBe(0)
  })

  it('figuras: estilo, texto, trazados y degradados se serializan', () => {
    const src = `${META}
function render(l,e,p){
  draw.rect(0,0,10,10,{fill:"#f00",radius:3}).alpha(0.5);
  draw.path("M 0 0 L 100 0 L 100 50 Z", {stroke:"blue",strokeWidth:2});
  draw.text("Hola", 10, 50, {size:20, align:"center"});
  draw.star(50,50,5,40,20);
  draw.circle(5,5,5,{gradient:{type:"radial",stops:[[0,"#fff"],[1,color.rgb(0,0,0,0.5)]]}});
}`
    const t = new TransitionInstance(src)
    t.init()
    const shapes = t.render(0.5).items.filter((i) => i.kind === 'shape') as ShapeItem[]
    expect(shapes.map((s) => s.geometry.type)).toEqual(['rect', 'path', 'text', 'star', 'circle'])
    expect(shapes[0]!.style.fill).toBe('rgba(255, 0, 0, 1)')
    expect(shapes[0]!.opacity).toBeCloseTo(0.5)
    expect(shapes[4]!.style.gradient!.stops[1]![1]).toBe('rgba(0, 0, 0, 0.5)')
  })
})
