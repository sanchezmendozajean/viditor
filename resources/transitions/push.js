const meta = {
  apiVersion: 1,
  id: "push",
  name: "Empujar",
  category: "Deslizar",
  description: "El clip entrante entra empujando al saliente, que solo se desplaza un poco y se oscurece.",
  defaultDuration: 0.8,
  audio: "crossfade",
  params: {
    direction: { type: "enum", label: "Dirección", options: ["izquierda", "derecha", "arriba", "abajo"], default: "izquierda" },
    easing: { type: "easing", label: "Suavizado", default: "inOutCubic" },
    parallax: { type: "number", label: "Desplazamiento del saliente", default: 0.3, min: 0, max: 1, step: 0.05 }
  }
};

const DIRECTIONS = {
  izquierda: [-1, 0],
  derecha: [1, 0],
  arriba: [0, -1],
  abajo: [0, 1]
};

function render(leaveClip, enterClip, progress, ctx) {
  const p = ease[ctx.params.easing](progress);
  const [dx, dy] = DIRECTIONS[ctx.params.direction];
  const w = screen.width;
  const h = screen.height;

  // El entrante cruza la pantalla desde el lado opuesto y se dibuja delante
  enterClip.z(2).move(-dx * (1 - p) * w, -dy * (1 - p) * h);
  // El saliente se desplaza solo una fracción y se oscurece al ser empujado
  leaveClip.move(dx * p * w * ctx.params.parallax, dy * p * h * ctx.params.parallax).brightness(1 - 0.5 * p);
}
