const meta = {
  apiVersion: 1,
  id: "crossfade",
  name: "Fundido cruzado",
  category: "Fundidos",
  defaultDuration: 1.0,
  audio: "crossfade",
  params: {
    easing: { type: "easing", label: "Suavizado", default: "linear" }
  }
};

function render(leaveClip, enterClip, progress, ctx) {
  const p = ease[ctx.params.easing](progress);
  leaveClip.alpha(1 - p); // 1 → 0: el saliente se vuelve transparente
  enterClip.alpha(p);     // 0 → 1: el entrante aparece
}
