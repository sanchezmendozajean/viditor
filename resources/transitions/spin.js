const meta = {
  apiVersion: 1,
  id: "spin",
  name: "Giro",
  category: "Geométricas",
  description: "El clip saliente gira y se encoge mientras el entrante aparece girando hasta su sitio.",
  defaultDuration: 1.0,
  audio: "crossfade",
  params: {
    turns: { type: "number", label: "Vueltas", default: 1, min: -4, max: 4, step: 0.25 },
    easing: { type: "easing", label: "Suavizado", default: "inOutCubic" }
  }
};

function render(leaveClip, enterClip, progress, ctx) {
  const p = ease[ctx.params.easing](progress);
  const angle = ctx.params.turns * 360;

  leaveClip.rotate(angle * p).scale(1 - p).alpha(1 - p);
  enterClip.z(2).rotate(-angle * (1 - p)).scale(p).alpha(p);
}
