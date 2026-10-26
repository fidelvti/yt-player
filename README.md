# yt-player

Reproductor de YouTube personal, sencillo y a medida. Sin buscador, sin likes ni comentarios.

## Qué hace

- **Login con tu cuenta de Google** y lectura de tus suscripciones (solo lectura).
- **Listas de canales propias**: agrupa tus suscripciones (p. ej. 70 canales en 7 listas). Un canal solo puede estar en una lista. Las listas se renombran y borran con los iconos de la barra lateral; borrar una lista no pierde sus canales, solo vuelven a quedar *sin lista*.
- **Gestionar listas** con filtro de canales sin lista y barra de progreso. Si te das de baja de un canal en YouTube, se quita solo de tus listas.
- **Feed por lista** con los vídeos recientes de sus canales (vídeos y directos, sin shorts) y botón para actualizarlo.
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
| Arrancar con un doble clic | `yt-player.command` (arranca y abre el navegador) |
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
  lists.ts       listas de canales y limpieza de bajas de suscripción
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

- `yt-player.db`: SQLite con listas, vistos, transcripciones (30 días), resúmenes (30 días) y gasto.
- `tokens.json`: tokens de acceso a tu cuenta de Google. Trátalo como una contraseña.

Para empezar de cero basta con borrar `data/` (volverás a iniciar sesión). La variable opcional `YT_PLAYER_DATA` apunta a otra carpeta de datos, útil para probar sin tocar las listas reales.

## Sesión de Google

- **Cerrar sesión** (abajo en la barra lateral) borra `data/tokens.json`. No revoca el permiso en Google; para eso usa https://myaccount.google.com/permissions.
- Si el acceso caduca, la app lo detecta, descarta el token y muestra *"Tu sesión de Google ha caducado"* con el botón para entrar de nuevo.
- Mientras la app de Google siga en modo *Prueba*, el acceso caduca a los 7 días.

## Sitio público (`docs/`)

`docs/` se publica con GitHub Pages en https://fidelvti.github.io/yt-player/ y contiene la página principal y la [política de privacidad](https://fidelvti.github.io/yt-player/privacy.html) que exige Google para publicar la app OAuth. Incluye el archivo de verificación de Search Console; no lo borres.

## Cosas a tener en cuenta

- **Transcripciones**: no hay vía oficial. Se obtienen con yt-dlp de los subtítulos autogenerados, que es una vía no autorizada por YouTube y puede romperse cuando YouTube cambie algo. Los vídeos sin subtítulos se omiten del resumen y el panel lo indica.
- **Límites del resumen**: hasta 20 vídeos y unos 300.000 caracteres de texto por resumen.
- **Coste**: cada resumen muestra lo que ha costado y el acumulado del mes, calculado con los tokens que devuelve la API.
- **Feed**: los últimos ~15 vídeos de cada canal. La fuente principal es la API de YouTube (listas de subidas `UULF` para vídeos y `UULV` para directos, que dejan fuera los shorts de forma exacta). Cada actualización completa gasta unas 100 unidades de la cuota diaria gratuita de 10.000; si se agotara, se usa el RSS durante 10 minutos.
- **RSS como respaldo**: el RSS de YouTube falla de forma intermitente (404/500 puntuales), por eso ya no es la fuente principal. Se usa si no hay sesión de Google o la API falla, con reintentos y, si aun así no responde, con los datos de la última carga correcta. Si un canal se queda sin datos, el feed lo avisa con su nombre.
- **Bajas de suscripción**: al cargar la app o pulsar *Actualizar suscripciones* se quitan de las listas los canales de los que ya no estás suscrito. Si hubiera que quitar más de la mitad de golpe (posible fallo de YouTube), no se toca nada y se avisa.

## Problemas frecuentes

| Síntoma | Causa y solución |
|---|---|
| `redirect_uri_mismatch` al iniciar sesión | El URI del cliente OAuth no es exactamente `http://localhost:3000/auth/callback` |
| Hay que volver a iniciar sesión cada semana | La app de Google está en modo *Prueba*, que caduca el acceso a los 7 días. Pásala a *En producción*, lo que exige tener verificados los datos de la ficha (Branding), ver *Sitio público* |
| Un canal no aparece en el feed y sale un aviso con su nombre | YouTube no respondió tras varios intentos; pulsa *Actualizar*. Los detalles quedan en la consola del servidor |
| Un canal sigue en una lista aunque me di de baja | Se limpia al recargar o con *Actualizar suscripciones*. Si no se quita, puede haber saltado la salvaguarda (aviso en la app) |
| Aviso de "app no verificada" | Es esperado en una app personal; se puede continuar |
| "yt-dlp no está instalado" | `brew install yt-dlp`, o apunta `YT_DLP_PATH` en `.env` al ejecutable |
| yt-dlp falla con "The page needs to be reloaded" | Prueba otro cliente con `YT_DLP_PLAYER_CLIENT` en `.env` (por defecto `android_vr`) |
| El vídeo no arranca con código 101 o 150 | El canal ha bloqueado la inserción; usa "Abrir en YouTube" |
| El vídeo no arranca en el navegador del editor | Úsalo en Safari o Chrome: el navegador integrado del editor no envía bien el origen |
| "No se pudo llamar a la API de Anthropic" | Falta o es incorrecta `ANTHROPIC_API_KEY` en `.env` |
