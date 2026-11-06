const meta = {
  apiVersion: 1,
  id: "dip-to-white",
  name: "Fundido a blanco",
  category: "Fundidos",
  description: "El clip saliente se funde a blanco y el entrante aparece desde él.",
  defaultDuration: 1.0,
  audio: "crossfade",
  params: {
    color: { type: "color", label: "Color", default: "#ffffff" }
  }
};

function render(leaveClip, enterClip, progress, ctx) {
  // Primera mitad: el saliente se funde al color; segunda mitad: el entrante aparece
  if (progress < 0.5) {
    enterClip.visible(false);
    draw.fill(ctx.params.color).alpha(progress * 2);
  } else {
    leaveClip.visible(false);
    draw.fill(ctx.params.color).alpha((1 - progress) * 2);
  }
}
