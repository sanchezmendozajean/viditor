// Ejemplo avanzado: las piezas del clip saliente salen volando y girando al azar (determinista)
const meta = {
  apiVersion: 1,
  id: "shatter-spin",
  name: "Estallido giratorio",
  category: "Geométricas",
  defaultDuration: 1.2
};

let parts;
let motion = [];

function init(leaveClip, enterClip, ctx) {
  parts = leaveClip.splitGrid(8, 6);
  // Se calcula una vez por instancia: dirección y giro de cada pieza
  motion = parts.map(() => ({
    angle: ctx.random() * Math.PI * 2,
    dist: 0.6 + ctx.random() * 0.8,
    spin: (ctx.random() - 0.5) * 720
  }));
}

function render(leaveClip, enterClip, progress) {
  const p = ease.inCubic(progress);
  enterClip.scale(math.lerp(1.15, 1, ease.outCubic(progress)));

  for (const part of parts) {
    const m = motion[part.index];
    const d = p * m.dist * screen.width;
    part
      .move(Math.cos(m.angle) * d, Math.sin(m.angle) * d)
      .rotate(m.spin * p)
      .scale(1 - p * 0.5)
      .alpha(1 - p);
  }
}
