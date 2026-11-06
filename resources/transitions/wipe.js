const meta = {
  apiVersion: 1,
  id: "wipe",
  name: "Barrido",
  category: "Barridos",
  description: "Una línea recta recorre la pantalla y descubre el clip entrante.",
  defaultDuration: 1.0,
  audio: "crossfade",
  params: {
    angle: { type: "angle", label: "Ángulo", default: 0 },
    feather: { type: "number", label: "Suavizado de borde", default: 40, min: 0, max: 400, step: 1 },
    easing: { type: "easing", label: "Suavizado", default: "inOutQuad" }
  }
};

function render(leaveClip, enterClip, progress, ctx) {
  const p = ease[ctx.params.easing](progress);
  const a = math.degToRad(ctx.params.angle);
  const feather = ctx.params.feather;

  // Eje del barrido (u) y su perpendicular (v), con origen en el centro de la pantalla
  const cx = screen.width / 2;
  const cy = screen.height / 2;
  const ux = Math.cos(a), uy = Math.sin(a);
  const vx = -uy, vy = ux;

  // Distancia desde el centro hasta la esquina más lejana: el borde recorre [-R, R]
  const R = Math.hypot(cx, cy);
  const L = R * 2;
  const edge = math.lerp(-R - feather, R + feather, p);

  // Semiplano "ya recorrido": desde -L hasta la posición del borde
  const pt = (u, v) => [cx + u * ux + v * vx, cy + u * uy + v * vy];
  const area = draw.polygon([pt(-L, -L), pt(edge, -L), pt(edge, L), pt(-L, L)]);

  enterClip.z(2).mask(area, { feather });
}
