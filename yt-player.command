#!/bin/zsh -l
# Doble clic para arrancar yt-player: levanta el servidor y abre el navegador.
# Para pararlo, cierra esta ventana o pulsa Ctrl+C.
cd "$(dirname "$0")" || exit 1
(sleep 4 && open "http://localhost:5173") &
npm run dev
