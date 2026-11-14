# yt-player

Reproductor personal de YouTube: login con Google, suscripciones agrupadas en listas, feed por lista, reproductor con velocidad, vídeos vistos y resúmenes con Claude. Uso personal, corre en local. El README explica qué hace y cómo se instala; aquí va lo que no se deduce del código.

## Comandos

- `npm run dev` (raíz): backend en :3000 y Vite en :5173, ambos con recarga en caliente. Tras tocar `.env` hay que reiniciar.
- `npm run typecheck`: único chequeo automático. **No hay tests**: se verifica con scripts `npx tsx --eval` y con `curl`.
- Stack: Node 26 con `node:sqlite`, Express 5, React + Vite, TypeScript estricto. La interfaz, los mensajes y los comentarios están en español; sigue esa convención.

## Cómo trabajar aquí

- **`data/` y `.env` son del usuario y están en `.gitignore`.** `data/yt-player.db` guarda sus listas reales. Para probar escritura usa una carpeta temporal con `YT_PLAYER_DATA=$(mktemp -d)` y un servidor en otro puerto (`PORT=3999`), nunca el servidor en marcha. `YT_PLAYER_DATA` aparta también `tokens.json`. Contra el servidor real no ejecutes `/auth/logout` ni `/api/subscriptions/prune` (borran tokens o canales de sus listas); un servidor de pruebas sí puede, porque trabaja sobre datos temporales.
- **No llames a la API de Anthropic para probar sin avisar**: cada resumen cuesta dinero real del usuario.
- No hagas commit ni push salvo que lo pida; suele hacerlos él. Los mensajes de commit van en español y terminan con la línea `Co-Authored-By`.
- El usuario no ve lo que tú ves: di claramente qué has comprobado de verdad y qué no (p. ej. la interfaz renderizada).

## Decisiones y trampas (aprendidas a golpes)

- **El feed sale de la API de YouTube, no del RSS.** `server/src/uploads.ts` lee las listas de subidas `UULF` (vídeos, sin shorts) y `UULV` (directos) a partir del id del canal. El RSS falla de forma intermitente (404/500 con la misma URL) y quedó como respaldo con reintentos y datos antiguos. El RSS no marca los shorts: se detectan por `/shorts/` en el enlace. Cada refresco completo cuesta ~100 unidades de cuota (10.000/día).
- **Transcripciones (`transcripts.ts`)**: no hay vía oficial. Se usa `yt-dlp --dump-single-json` con el cliente `android_vr` (el de por defecto falla con "The page needs to be reloaded") y se descarga la pista `json3` por su URL. No pidas varios idiomas con `--sub-langs ".*-orig"`: YouTube responde 429 y yt-dlp sale con error aunque ya tenga el archivo.
- **React StrictMode ejecuta los efectos dos veces en desarrollo.** Una petición que cuesta dinero (`/api/summarize`) se lanzaba por duplicado; `Summary.tsx` lo evita con un `ref` y el servidor comparte las peticiones idénticas en vuelo. Mantén ese patrón en cualquier efecto con coste.
- **La app OAuth de Google está *En producción* (sin verificar):** en modo *Prueba* el acceso caducaba a los 7 días; en producción **no caduca** (confirmado el 12/11: el acceso del 3/11 seguía funcionando a los 9 días). La app detecta un acceso caducado (`isAuthExpired`), descarta el token y pide volver a entrar. Quedan dos avisos de Google que **no hay que perseguir**: el de verificación completa de permisos sensibles (no hace falta con 1 usuario de 100) y la verificación de la *marca*, que falla ("la página principal no está registrada a tu nombre") porque `github.io` es un dominio compartido; solo afecta a cómo se ve la pantalla de permisos. Para arreglarlo haría falta un dominio propio verificado por DNS en Search Console, y se decidió que no compensa. **No borrar** `docs/` ni el repositorio `fidelvti/fidelvti.github.io` (la ficha de Google enlaza a esas páginas, que deben seguir públicas) ni sus archivos de verificación.
- **Las bajas de suscripción pasan al catálogo y se quitan de las listas** con `reconcileSubscriptions` (`snapshot.ts`), que compara con el histórico guardado en SQLite. Pocas bajas (≤ 20 % de las conocidas, mínimo 5) se aplican al momento; si son más, exige que el canal siga ausente en una lectura ≥ 30 min después de la primera (si reaparece, se reinicia la cuenta), o el botón *Quitar ahora*. Una lectura vacía se ignora. La lógica recibe `now` como parámetro para probarla sin esperar. **El catálogo** (`catalog_channels`, `catalog.ts`) guarda los canales no suscritos (`source` = `baja` o `import`); un canal al que te suscribes sale de él solo y, si al darse de baja estaba en una lista (`list_id`, que se guarda), vuelve a ella. Se pueden añadir canales pegando URL o `@handle` (`POST /api/catalog`, `parseChannelInput` + `channels.list` de solo lectura, 1 unidad por canal). Las suscripciones de YouTube no traen el `@handle`: `handles.ts` lo pide aparte con `channels.list` en lotes de 50 (solo para canales sin handle; `""` = consultado y sin handle) y lo guarda en el histórico y en el catálogo. Lo mismo desde una lista (`POST /api/lists/:id/channels`, `addToList`): una lista solo contiene canales suscritos, así que uno no suscrito queda en el catálogo con esa lista como `list_id` y se une a ella al suscribirte. **La app es de solo lectura sobre YouTube** (permiso `youtube.readonly`): suscribirse y darse de baja lo hace el usuario a mano en YouTube; se descartó pedir un permiso de escritura (`subscriptions.insert/delete` exigen `youtube`, que da control de la cuenta, y obligaría a cambiar la política de privacidad).
- **Duración de los vídeos** (`durations.ts`): `videos.list` en lotes de 50, 1 unidad por lote, y se guarda en `video_durations` porque no cambia (solo se pide por los vídeos nuevos). Un directo en curso devuelve 0 y **no se guarda**, para volver a mirarlo cuando acabe.
- **Caducidades:** vistos 7 días; transcripciones y resúmenes 30 días; duraciones 60 días; caché del feed 5 min en memoria.
- **Resúmenes:** modelo `claude-haiku-5-5` con `effort: "low"`. Los precios están en constantes de `summarize.ts`; si cambias de modelo, cámbialos también. El prompt es deliberadamente seco (el usuario se quejó de resúmenes largos). Se limita el texto de entrada para no pasar del tramo de 100K tokens.
- **Reproductor:** funciona en Safari o Chrome con la sesión de YouTube Premium (sin anuncios). El navegador integrado de VS Code no envía el origen y falla (error 153). Algunos canales bloquean la inserción (códigos 101 y 150).
- Antes de borrar o renombrar algo del usuario, mira el objetivo: los canales de una lista borrada no se pierden, vuelven a "sin lista".

## Tareas pendientes conocidas

- Tests de la capa de transcripciones, la más frágil ante cambios de YouTube.
