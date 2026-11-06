const meta = {
  apiVersion: 1,
  id: "crossfade",
  name: "Fundido cruzado",
  category: "Fundidos",
  description: "El clip saliente se vuelve transparente y deja ver al entrante.",
  defaultDuration: 1.0,
  audio: "crossfade",
  params: {
    easing: { type: "easing", label: "Suavizado", default: "linear" }
  }
};

function render(leaveClip, enterClip, progress, ctx) {
  const p = ease[ctx.params.easing](progress);
  // El entrante queda opaco debajo y el saliente se desvanece encima: así la
  // mezcla es exacta (saliente·(1-p) + entrante·p) y no se oscurece a mitad.
  leaveClip.alpha(1 - p);
}
