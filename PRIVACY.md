# Política de privacidad de yt-player

*Última actualización: 25 de octubre de 2026*

yt-player es una aplicación personal de código abierto que cada usuario ejecuta en su propio ordenador. No existe ningún servidor central: el autor no recibe, almacena ni procesa ningún dato de quienes la usan.

## Qué datos de Google se utilizan

Al iniciar sesión, la app solicita un único permiso, de **solo lectura**: `https://www.googleapis.com/auth/youtube.readonly`. Lo usa para leer la lista de canales a los que estás suscrito, de modo que puedas organizarlos en listas. No puede modificar tu cuenta, tus suscripciones ni tus vídeos.

## Dónde se guardan los datos

Todo se guarda **únicamente en tu ordenador**, en la carpeta `data/` de la aplicación:

- Los tokens de acceso a tu cuenta de Google.
- Tus listas de canales, los vídeos que has visto y los resúmenes que has generado.

Puedes borrarlos en cualquier momento eliminando esa carpeta. También puedes revocar el acceso de la app desde https://myaccount.google.com/permissions.

## Con quién se comparten

- **Google / YouTube**: la app se comunica con sus servicios para leer tus suscripciones y reproducir vídeos.
- **Anthropic**: cuando pides un resumen, el texto de las transcripciones de los vídeos seleccionados se envía a la API de Anthropic para generarlo. No se envían tus datos de cuenta de Google ni tu lista de suscripciones.

No se vende, no se cede a terceros y no se usa con fines publicitarios.

## Uso limitado de los datos de Google

El uso que yt-player hace de la información recibida de las API de Google se ajusta a la [Política de datos de usuario de los servicios de API de Google](https://developers.google.com/terms/api-services-user-data-policy), incluidos los requisitos de uso limitado (*Limited Use*).

## Contacto

Para cualquier duda, abre una incidencia en https://github.com/fidelvti/yt-player/issues.

---

**English summary:** yt-player is a personal, open-source app that runs locally on each user's computer. It requests read-only access to your YouTube subscriptions (`youtube.readonly`). All data stays on your machine; nothing is sent to the author. When you request a summary, the transcripts of the selected videos are sent to Anthropic's API. Data is never sold or used for advertising, and use of Google user data complies with the Google API Services User Data Policy, including its Limited Use requirements.
