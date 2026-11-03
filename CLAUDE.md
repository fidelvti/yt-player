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
- **La app OAuth de Google está en modo *Prueba*:** el acceso caduca a los 7 días. La app lo detecta (`isAuthExpired`), descarta el token y pide volver a entrar. Publicarla exige verificar el dominio de la página principal: está en `docs/` (GitHub Pages, `fidelvti.github.io/yt-player`) con el archivo de verificación de Search Console, que **no se debe borrar**. Estado del trámite en Google (3/11): el reintento de verificación de la marca devuelve "la página principal no está registrada a tu nombre" y "protegida por una página de acceso". Lo segundo es un falso positivo: el sitio responde 200, sin login. Lo primero apunta a la propiedad de Search Console (comprobar que esté verificada y en la misma cuenta que posee el proyecto de Google Cloud).
- **Las bajas de suscripción se quitan de las listas** con `reconcileSubscriptions` (`snapshot.ts`), que compara con el histórico guardado en SQLite. Pocas bajas (≤ 20 % de las conocidas, mínimo 5) se aplican al momento; si son más, exige que el canal siga ausente en una lectura ≥ 30 min después de la primera (si reaparece, se reinicia la cuenta), o el botón *Quitar ahora*. Una lectura vacía se ignora. La lógica recibe `now` como parámetro para probarla sin esperar.
- **Caducidades:** vistos 7 días; transcripciones y resúmenes 30 días; caché del feed 5 min en memoria.
- **Resúmenes:** modelo `claude-haiku-5-5` con `effort: "low"`. Los precios están en constantes de `summarize.ts`; si cambias de modelo, cámbialos también. El prompt es deliberadamente seco (el usuario se quejó de resúmenes largos). Se limita el texto de entrada para no pasar del tramo de 100K tokens.
- **Reproductor:** funciona en Safari o Chrome con la sesión de YouTube Premium (sin anuncios). El navegador integrado de VS Code no envía el origen y falla (error 153). Algunos canales bloquean la inserción (códigos 101 y 150).
- Antes de borrar o renombrar algo del usuario, mira el objetivo: los canales de una lista borrada no se pierden, vuelven a "sin lista".

## Tareas pendientes conocidas

- Pasar la app de Google a producción cuando el trámite lo permita.
- Tests de la capa de transcripciones, la más frágil ante cambios de YouTube.
