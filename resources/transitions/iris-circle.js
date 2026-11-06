const meta = {
  apiVersion: 1,
  id: "iris-circle",
  name: "Iris circular",
  category: "Formas",
  defaultDuration: 1.0,
  params: {
    center: { type: "point", label: "Centro", default: [0.5, 0.5] },
    feather: { type: "number", label: "Suavizado de borde", default: 8, min: 0, max: 200 }
  }
};

function render(leaveClip, enterClip, progress, ctx) {
  const [nx, ny] = ctx.params.center;
  const cx = nx * screen.width;
  const cy = ny * screen.height;
  // Radio necesario para cubrir toda la pantalla desde el centro elegido
  const maxR = Math.hypot(Math.max(cx, screen.width - cx), Math.max(cy, screen.height - cy));

  const hole = draw.circle(cx, cy, ease.inOutQuad(progress) * maxR);
  enterClip.z(2).mask(hole, { feather: ctx.params.feather }); // el entrante aparece dentro del círculo
}
