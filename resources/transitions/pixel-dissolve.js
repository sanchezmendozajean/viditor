const meta = {
  apiVersion: 1,
  id: "pixel-dissolve",
  name: "Disolución pixelada",
  category: "Fundidos",
  description: "Ambos clips se pixelan al máximo a mitad de la transición mientras se mezclan.",
  defaultDuration: 1.0,
  audio: "crossfade",
  params: {
    block: { type: "number", label: "Tamaño máximo del bloque", default: 80, min: 2, max: 400, step: 1 }
  }
};

function render(leaveClip, enterClip, progress, ctx) {
  // Bloque: 1 al principio y al final, máximo en el centro
  const size = 1 + Math.sin(progress * Math.PI) * (ctx.params.block - 1);
  leaveClip.pixelate(size).alpha(1 - progress);
  enterClip.pixelate(size);
}
