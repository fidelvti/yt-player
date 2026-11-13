# yt-player

Reproductor de YouTube personal, sencillo y a medida. Sin buscador, sin likes ni comentarios.

## Qué hace

- **Login con tu cuenta de Google** y lectura de tus suscripciones (solo lectura).
- **Listas de canales propias**: agrupa tus suscripciones (p. ej. 70 canales en 7 listas). Un canal solo puede estar en una lista. Las listas se renombran y borran con los iconos de la barra lateral; borrar una lista no pierde sus canales, solo vuelven a quedar *sin lista*.
- **Gestionar listas** con filtro de canales sin lista y barra de progreso. Si te das de baja de un canal en YouTube, se quita de tus listas y pasa al *Catálogo* (ver *Bajas de suscripción*).
- **Catálogo**: canales que conoces pero a los que no estás suscrito (los que dejas de seguir y los que añadas tú pegando una URL o un `@handle`; admite varios a la vez). Cada uno tiene un enlace para abrirlo en YouTube y suscribirte a mano; la app nunca se suscribe ni se da de baja por ti. Al suscribirte, desaparece del catálogo en la siguiente actualización y, si venía de una lista, **vuelve a ella**.
- **Feed por lista** con los vídeos recientes de sus canales (vídeos y directos, sin shorts). *Actualizar* vuelve a leer primero tus suscripciones (altas, bajas) y después los vídeos.
- **Vídeos / Canales en cada lista**: un selector alterna entre el feed y la lista de canales de esa lista (foto, nombre y enlace a YouTube, con el mismo formato que el Catálogo). Desde *Canales* se pueden añadir canales a la lista pegando una URL o un `@handle`: si ya estás suscrito entran en ella; si no, quedan pendientes en el Catálogo y se unen a la lista cuando te suscribas. También se pueden sacar de la lista (siguen suscritos, quedan *sin lista*).
- **Reproductor** integrado con velocidad ajustable (1x a 2x, la última se recuerda). Con Premium en el navegador no muestra anuncios.
- **Vídeos vistos**: se marcan al empezar a reproducirse, se atenúan en el feed y caducan a los 7 días. Pulsando la etiqueta *✓ Visto* se quita la marca.
- **Resumen** de los vídeos que selecciones: un único texto con los puntos principales, sin repetir lo que coincide entre vídeos. Se guarda 30 días en la sección *Resúmenes* y se reabre desde la etiqueta **✦ Resumido** de cada vídeo. Desde un resumen guardado se puede volver a generar (nueva llamada a la API).

## Requisitos

| Qué | Para qué |
|---|---|
| Node.js reciente (probado con 26; usa el módulo `node:sqlite`) | Todo |
| `yt-dlp` (`brew install yt-dlp`) | Descargar transcripciones para los resúmenes |
| Proyecto de Google Cloud con OAuth | Login y suscripciones |
| Clave de la API de Anthropic | Resúmenes (modelo Haiku 5.5, céntimos al mes) |

## Puesta en marcha

```bash
npm install
cp .env.example .env     # y rellénalo (ver abajo)
npm run dev
```

Abre http://localhost:5173 e inicia sesión con Google.

### Credenciales de Google

1. En [console.cloud.google.com](https://console.cloud.google.com) crea un proyecto y habilita **YouTube Data API v3**.
2. Configura la pantalla de consentimiento OAuth (usuario **Externo**), añade tu Gmail como usuario de prueba y el permiso `.../auth/youtube.readonly`.
3. Crea un **ID de cliente OAuth** de tipo *Aplicación web* con el URI de redirección `http://localhost:3000/auth/callback`.
4. Copia el ID y el secreto a `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` en `.env`.

### Clave de Anthropic

Crea una clave en [console.anthropic.com](https://console.anthropic.com), carga saldo y ponla en `ANTHROPIC_API_KEY` en `.env`. Ahí mismo puedes fijar un límite de gasto mensual.

## Arrancar y parar

| Acción | Comando |
|---|---|
| Arrancar backend y frontend | `npm run dev` (desde la raíz) |
| Parar | `Ctrl+C` en esa terminal, o cerrar la ventana si lo abriste con el doble clic |
| Comprobar tipos | `npm run typecheck` |

`npm run dev` levanta dos procesos: el backend en http://localhost:3000 y el frontend (Vite) en http://localhost:5173. Los dos se recargan solos al editar el código; tras cambiar `.env` hay que reiniciar.

Si un puerto se queda ocupado tras cerrar mal la terminal:

```bash
lsof -t -iTCP:3000 -iTCP:5173 -sTCP:LISTEN | xargs kill   # libera ambos puertos
```

## Estructura

```
server/src/
  index.ts       rutas de la API
  auth.ts        OAuth de Google y tokens
  youtube.ts     suscripciones (YouTube Data API)
  feed.ts        feed por canal: API de YouTube y, si falla, RSS; caché de 5 min
  uploads.ts     vídeos de un canal desde sus listas de subidas (UULF + UULV, sin shorts)
  lists.ts       listas de canales
  snapshot.ts    histórico de suscripciones, detección de bajas y paso al catálogo
  catalog.ts     catálogo de canales no suscritos
  handles.ts     completa el @handle de los canales (en lotes de 50, solo los que faltan)
  watched.ts     vídeos vistos (caducan a los 7 días)
  transcripts.ts transcripciones con yt-dlp, con caché
  summarize.ts   resumen con Claude, historial y gasto
  db.ts          esquema SQLite
web/src/         interfaz (Vite + React + TypeScript); SidebarList.tsx y listOps.ts gestionan renombrar y borrar listas
data/            datos locales, ignorados por git (ver abajo)
docs/            sitio público (GitHub Pages): página principal y política de privacidad
```

## Datos locales (`data/`)

Nada de esto se sube a git:

- `yt-player.db`: SQLite con listas, vistos, transcripciones (30 días), resúmenes (30 días), gasto, el histórico de suscripciones y `catalog_channels` (el catálogo: canales que conoces pero a los que no estás suscrito).
- `tokens.json`: tokens de acceso a tu cuenta de Google. Trátalo como una contraseña. Si usas `YT_PLAYER_DATA`, tanto la base de datos como los tokens se leen de esa otra carpeta.

Para empezar de cero basta con borrar `data/` (volverás a iniciar sesión). La variable opcional `YT_PLAYER_DATA` apunta a otra carpeta de datos, útil para probar sin tocar las listas reales.

## Sesión de Google

- **Cerrar sesión** (abajo en la barra lateral) borra `data/tokens.json`. No revoca el permiso en Google; para eso usa https://myaccount.google.com/permissions.
- Si el acceso caduca, la app lo detecta, descarta el token y muestra *"Tu sesión de Google ha caducado"* con el botón para entrar de nuevo.
- La app de Google está **en producción** (sin verificar). Con eso el acceso **no caduca** a los 7 días, que es lo que pasa en modo *Prueba* (comprobado: un acceso del 3/11 seguía funcionando el 12/11). Al ser una app sin verificar, Google muestra el aviso de "app no verificada" al iniciar sesión; se puede continuar.

## Sitio público (`docs/`)

La ficha de la app en Google (pantalla de consentimiento) enlaza a una página principal y a una política de privacidad, que deben seguir públicas. Existen dos copias:

- `docs/` se publica con GitHub Pages en https://fidelvti.github.io/yt-player/.
- El repositorio [fidelvti/fidelvti.github.io](https://github.com/fidelvti/fidelvti.github.io) las sirve desde la raíz, en https://fidelvti.github.io/ y https://fidelvti.github.io/privacy.html.

Ambas incluyen el archivo de verificación de Search Console; no lo borres. La verificación de la *marca* (nombre y logo) sigue fallando porque `github.io` es un dominio compartido y Google no lo da por tuyo; no impide el funcionamiento de la app y solo afecta a cómo se ve la pantalla de permisos.

## Cosas a tener en cuenta

- **Transcripciones**: no hay vía oficial. Se obtienen con yt-dlp de los subtítulos autogenerados, que es una vía no autorizada por YouTube y puede romperse cuando YouTube cambie algo. Los vídeos sin subtítulos se omiten del resumen y el panel lo indica.
- **Límites del resumen**: hasta 20 vídeos y unos 300.000 caracteres de texto por resumen.
- **Coste**: cada resumen muestra lo que ha costado y el acumulado del mes, calculado con los tokens que devuelve la API.
- **Feed**: los últimos ~15 vídeos de cada canal. La fuente principal es la API de YouTube (listas de subidas `UULF` para vídeos y `UULV` para directos, que dejan fuera los shorts de forma exacta). Cada actualización completa gasta unas 100 unidades de la cuota diaria gratuita de 10.000; si se agotara, se usa el RSS durante 10 minutos.
- **RSS como respaldo**: el RSS de YouTube falla de forma intermitente (404/500 puntuales), por eso ya no es la fuente principal. Se usa si no hay sesión de Google o la API falla, con reintentos y, si aun así no responde, con los datos de la última carga correcta. Si un canal se queda sin datos, el feed lo avisa con su nombre.
- **Bajas de suscripción**: al cargar la app o pulsar *Actualizar suscripciones* se compara tu lista de suscripciones con la lectura anterior (guardada en SQLite).
  - Pocas bajas (hasta el 20 % de tus suscripciones, mínimo 5): el canal se quita de sus listas al momento y el aviso dice cuáles.
  - Muchas a la vez: puede ser un fallo de YouTube, así que no se quita nada hasta que los canales sigan ausentes en una lectura posterior, **30 minutos o más** después de la primera. Si reaparecen entre medias, la cuenta empieza de nuevo. El aviso lista los canales, indica a partir de qué hora y ofrece **Quitar ahora** para no esperar.
  - Un canal dado de baja (esté o no en una lista) pasa al *Catálogo*, y sale de su lista si la tenía. La regla de los 30 minutos y el botón *Quitar ahora* valen igual para el catálogo.
  - Una lectura vacía se ignora. Al darse de baja se recuerda la lista del canal, y al volver a suscribirte vuelve a ella (al final) si la lista sigue existiendo; si no, queda *sin lista*. Un fallo puntual de YouTube que quite un canal de una lista se repara así solo en la lectura siguiente.

## Problemas frecuentes

| Síntoma | Causa y solución |
|---|---|
| `redirect_uri_mismatch` al iniciar sesión | El URI del cliente OAuth no es exactamente `http://localhost:3000/auth/callback` |
| Hay que volver a iniciar sesión cada semana | Es lo que ocurre si la app de Google está en modo *Prueba* (acceso de 7 días). Debería estar *En producción* (Google Auth Platform → Público). Si ya lo está y sigue pasando, el acceso guardado es antiguo: cierra sesión y entra de nuevo una vez |
| Un canal no aparece en el feed y sale un aviso con su nombre | YouTube no respondió tras varios intentos; pulsa *Actualizar*. Los detalles quedan en la consola del servidor |
| Un canal sigue en una lista aunque me di de baja | Si eran muchas bajas a la vez, esperan 30 minutos de confirmación: recarga pasado ese tiempo o pulsa *Quitar ahora* en el aviso |
| Aviso de "app no verificada" | Es esperado en una app personal; se puede continuar |
| "yt-dlp no está instalado" | `brew install yt-dlp`, o apunta `YT_DLP_PATH` en `.env` al ejecutable |
| yt-dlp falla con "The page needs to be reloaded" | Prueba otro cliente con `YT_DLP_PLAYER_CLIENT` en `.env` (por defecto `android_vr`) |
| El vídeo no arranca con código 101 o 150 | El canal ha bloqueado la inserción; usa "Abrir en YouTube" |
| El vídeo no arranca en el navegador del editor | Úsalo en Safari o Chrome: el navegador integrado del editor no envía bien el origen |
| "No se pudo llamar a la API de Anthropic" | Falta o es incorrecta `ANTHROPIC_API_KEY` en `.env` |
