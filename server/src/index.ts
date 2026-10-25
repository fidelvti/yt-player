import express from "express";
import { authUrl, authedClient, createClient, handleCallback } from "./auth.js";
import { fetchFeed } from "./feed.js";
import { loadLists, parseLists, saveLists } from "./lists.js";
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
    res.json(await listSubscriptions(client));
  } catch (err) {
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
  res.json(await fetchFeed(list.channelIds));
});

app.listen(port, () => console.log(`Servidor en http://localhost:${port}`));
