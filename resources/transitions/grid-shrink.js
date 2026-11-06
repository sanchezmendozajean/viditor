const meta = {
  apiVersion: 1,
  id: "grid-shrink",
  name: "Cuadrícula que se encoge",
  category: "Geométricas",
  author: "Pols",
  defaultDuration: 1.0,
  params: {
    cols: { type: "int", label: "Columnas", default: 4, min: 1, max: 32 },
    rows: { type: "int", label: "Filas", default: 3, min: 1, max: 32 },
    stagger: { type: "number", label: "Escalonado", default: 0.5, min: 0, max: 1, step: 0.05 }
  }
};

let leaveParts;

function init(leaveClip, enterClip, ctx) {
  // Corta la imagen del clip saliente en cols × rows partes
  leaveParts = leaveClip.splitGrid(ctx.params.cols, ctx.params.rows);
}

function render(leaveClip, enterClip, progress, ctx) {
  for (let i = 0; i < leaveParts.length; i++) {
    // Cada parte empieza un poco después que la anterior
    const local = math.stagger(i, leaveParts.length, progress, 1 - ctx.params.stagger);
    leaveParts[i].scale(1 - ease.inCubic(local));
  }
}
