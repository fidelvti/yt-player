import express from "express";
import { authUrl, authedClient, clearTokens, createClient, handleCallback, isAuthExpired } from "./auth.js";
import { fetchFeed } from "./feed.js";
import { loadLists, parseLists, pruneChannels, saveLists } from "./lists.js";
import { listSummaries, monthUsage, parseVideoRefs, SummaryError, summarizedMap, summarize } from "./summarize.js";
import { YtDlpMissingError } from "./transcripts.js";
import { isVideoId, listWatched, markWatched, unmarkWatched } from "./watched.js";
import { listSubscriptions } from "./youtube.js";

const app = express();
const port = Number(process.env.PORT ?? 3000);
const webUrl = process.env.WEB_URL ?? "http://localhost:5173";

app.get("/auth/login", (_req, res) => {
  res.redirect(authUrl(createClient()));
});

app.get("/auth/callback", async (req, res) => {
  const code = req.query.code;
  if (typeof code !== "string") {
    res.status(400).send("Falta el parámetro code");
    return;
  }
  try {
    await handleCallback(createClient(), code);
    res.redirect(webUrl);
  } catch (err) {
    console.error(err);
    res.status(500).send("No se pudo completar el login con Google");
  }
});

app.post("/auth/logout", async (_req, res) => {
  await clearTokens();
  res.status(204).end();
});

app.get("/api/me", async (_req, res) => {
  res.json({ loggedIn: (await authedClient()) !== null });
});

app.get("/api/subscriptions", async (_req, res) => {
  const client = await authedClient();
  if (!client) {
    res.status(401).json({ error: "No has iniciado sesión" });
    return;
  }
  try {
    const subscriptions = await listSubscriptions(client);
    // Las bajas de YouTube se reflejan en las listas: un canal que ya no sigues deja de aparecer en ellas.
    const { removed, skipped } = pruneChannels(new Set(subscriptions.map((s) => s.channelId)));
    res.json({ subscriptions, pruned: removed.length, pruneSkipped: skipped });
  } catch (err) {
    if (isAuthExpired(err)) {
      await clearTokens(); // el token ya no sirve: se descarta para que la app pida iniciar sesión
      res.status(401).json({ error: "session_expired" });
      return;
    }
    console.error(err);
    res.status(502).json({ error: "Error al consultar YouTube" });
  }
});

app.get("/api/lists", async (_req, res) => {
  res.json(await loadLists());
});

app.put("/api/lists", express.json(), async (req, res) => {
  const lists = parseLists(req.body);
  if (!lists) {
    res.status(400).json({ error: "Listas no válidas (¿canal repetido o nombre vacío?)" });
    return;
  }
  await saveLists(lists);
  res.json(lists);
});

app.get("/api/lists/:id/feed", async (req, res) => {
  const list = (await loadLists()).find((l) => l.id === req.params.id);
  if (!list) {
    res.status(404).json({ error: "Lista no encontrada" });
    return;
  }
  res.json(await fetchFeed(list.channelIds, req.query.refresh === "1"));
});

app.get("/api/watched", (_req, res) => {
  res.json(listWatched());
});

app.post("/api/watched/:videoId", (req, res) => {
  if (!isVideoId(req.params.videoId)) {
    res.status(400).json({ error: "videoId no válido" });
    return;
  }
  markWatched(req.params.videoId);
  res.status(204).end();
});

app.delete("/api/watched/:videoId", (req, res) => {
  if (!isVideoId(req.params.videoId)) {
    res.status(400).json({ error: "videoId no válido" });
    return;
  }
  unmarkWatched(req.params.videoId);
  res.status(204).end();
});

app.post("/api/summarize", express.json(), async (req, res) => {
  const videos = parseVideoRefs(req.body?.videos);
  if (!videos) {
    res.status(400).json({ error: "Selección no válida (de 1 a 20 vídeos)" });
    return;
  }
  try {
    res.json(await summarize(videos));
  } catch (err) {
    if (err instanceof SummaryError) {
      res.status(err.status).json({ error: err.message });
    } else if (err instanceof YtDlpMissingError) {
      res.status(503).json({ error: err.message });
    } else {
      console.error(err);
      res.status(500).json({ error: "Error inesperado al resumir" });
    }
  }
});

app.get("/api/summarized", (_req, res) => {
  res.json(summarizedMap());
});

app.get("/api/summaries", (_req, res) => {
  res.json(listSummaries());
});

app.get("/api/usage", (_req, res) => {
  res.json(monthUsage());
});

app.listen(port, () => console.log(`Servidor en http://localhost:${port}`));
