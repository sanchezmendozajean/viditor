const meta = {
  apiVersion: 1,
  id: "zoom-in",
  name: "Acercamiento",
  category: "Geométricas",
  description: "El clip saliente se acerca y se desvanece mientras el entrante termina de asentarse.",
  defaultDuration: 1.0,
  audio: "crossfade",
  params: {
    amount: { type: "number", label: "Intensidad", default: 1.5, min: 1, max: 4, step: 0.05 },
    easing: { type: "easing", label: "Suavizado", default: "inCubic" }
  }
};

function render(leaveClip, enterClip, progress, ctx) {
  const p = ease[ctx.params.easing](progress);
  leaveClip.scale(math.lerp(1, ctx.params.amount, p)).alpha(1 - p);
  // El entrante parte ligeramente ampliado y se asienta en su tamaño normal
  enterClip.scale(math.lerp(1 + (ctx.params.amount - 1) * 0.3, 1, ease.outCubic(progress)));
}
