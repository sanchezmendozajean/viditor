const meta = {
  apiVersion: 1,
  id: "slide-horizontal",
  name: "Deslizar horizontal",
  category: "Deslizar",
  author: "Pols",
  defaultDuration: 1.0,
  audio: "crossfade",
  params: {
    direction: { type: "enum", label: "Dirección", options: ["derecha", "izquierda"], default: "derecha" },
    easing: { type: "easing", label: "Suavizado", default: "inOutCubic" }
  }
};

function render(leaveClip, enterClip, progress, ctx) {
  const p = ease[ctx.params.easing](progress);
  const dir = ctx.params.direction === "derecha" ? 1 : -1;

  leaveClip.move(dir * p * screen.width, 0);
  enterClip.move(dir * (p - 1) * screen.width, 0);
}
