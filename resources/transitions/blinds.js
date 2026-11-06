const meta = {
  apiVersion: 1,
  id: "blinds",
  name: "Persianas",
  category: "Geométricas",
  description: "El clip saliente se corta en franjas que se cierran una tras otra, descubriendo al entrante.",
  defaultDuration: 1.0,
  audio: "crossfade",
  params: {
    strips: { type: "int", label: "Franjas", default: 8, min: 2, max: 64 },
    direction: { type: "enum", label: "Orientación", options: ["horizontal", "vertical"], default: "horizontal" },
    stagger: { type: "number", label: "Escalonado", default: 0.4, min: 0, max: 1, step: 0.05 }
  }
};

let strips;

function init(leaveClip, enterClip, ctx) {
  strips = leaveClip.splitStrips(ctx.params.strips, ctx.params.direction);
}

function render(leaveClip, enterClip, progress, ctx) {
  for (const strip of strips) {
    const local = ease.inOutQuad(math.stagger(strip.index, strips.length, progress, 1 - ctx.params.stagger));
    // Cada franja se encoge hacia su propio centro en el sentido de su grosor
    if (ctx.params.direction === "horizontal") strip.scale(1, 1 - local);
    else strip.scale(1 - local, 1);
  }
}
