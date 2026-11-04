# Viditor — guía para Claude Code

Editor de video de escritorio en Electron para **Windows y Linux** (no macOS).

## Antes de programar
1. Leer `specs/README.md` y los documentos 01–08 en orden.
2. Seguir la fase actual de `specs/08-hoja-de-ruta.md`; no adelantar funcionalidades de fases posteriores salvo lo necesario para no romper el modelo de datos.
3. Usar los tokens de color y la estructura de paneles de `specs/07-diseno-interfaz.md` y de la maqueta aprobada (Artifact de diseño).

## Reglas
- TypeScript estricto. Tipos compartidos en `src/shared/`.
- Renderer con `contextIsolation`, `sandbox` y sin `nodeIntegration`; E/S solo vía preload tipado.
- Vista previa y exportación DEBEN usar el mismo compositor y las mismas display lists de transición.
- Las transiciones integradas se escriben con la API pública (`specs/05-api-transiciones.md`), nunca como código nativo especial.
- El código de transiciones corre en un Web Worker sandbox; nunca con acceso a Node.
- Nunca modificar archivos fuente del usuario salvo la acción explícita "Mover al proyecto".
- Guardado atómico del `.vdproj`; mantener `formatVersion` y migraciones.
- Interfaz en español; código e identificadores en inglés.
- Probar en Windows y Linux (rutas con `path`, sin asumir separadores).
- **Autocontenido**: ninguna petición de red en tiempo de ejecución. Fuentes, iconos, imágenes, Monaco y documentación se empaquetan; nada de CDNs ni Google Fonts (`specs/02-arquitectura.md` §Autocontenido). El test e2e "sin red" debe pasar siempre.
- Todo miembro nuevo de la API de transiciones lleva JSDoc en español con `@example`; la referencia se genera desde el `.d.ts` (`specs/09-documentacion.md`). Al cambiar la API, actualizar también la guía y los ejemplos.
