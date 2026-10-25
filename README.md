# yt-player

Reproductor de YouTube personal, sencillo y a medida. Sin buscador, sin likes ni comentarios.

## Qué hace

- **Inicio de sesión con tu cuenta de YouTube** y lectura de tus suscripciones.
- **Listas de canales propias**: agrupa tus suscripciones (p. ej. 70 canales en 7 listas de 10).
- **Feed por lista**: eliges una lista y ves los vídeos más recientes de sus canales.
- **Reproductor** con velocidad ajustable (1x, 1.25x, 1.5x…).
- **Resumen de vídeos seleccionados**: marcas varios vídeos de una lista y obtienes un único texto con los puntos principales, sin repetir los temas que coinciden entre vídeos.

## Fuera de alcance

Buscador, likes, comentarios, subida de vídeos.

## Stack previsto (por confirmar)

- Frontend: Vite + React + TypeScript
- Backend ligero: Node + TypeScript (OAuth de Google, YouTube Data API, transcripciones y resumen con la API de Claude)
- Reproducción: YouTube IFrame Player API
- Almacenamiento local: listas y caché de resúmenes en `data/`

## Estado

Proyecto recién iniciado.
