export interface Subscription {
  channelId: string;
  title: string;
  thumbnail: string;
}

export interface ChannelList {
  id: string;
  name: string;
  channelIds: string[];
}

export interface FeedResponse {
  videos: FeedVideo[];
  /** Canales que no respondieron y no tienen datos anteriores: sus vídeos faltan. */
  failed: string[];
  /** Canales que no respondieron pero se muestran con los datos de la última carga correcta. */
  stale: string[];
}

export interface ChannelRef {
  channelId: string;
  title: string;
}

export interface PendingChannel extends ChannelRef {
  /** Desde cuándo se puede quitar de las listas si sigue ausente (ms desde 1970). */
  confirmAfter: number;
}

export interface CatalogChannel {
  channelId: string;
  title: string;
  handle: string | null;
  addedAt: number;
  /** 'baja': te diste de baja y la app lo detectó; 'import': añadido a mano o importado. */
  source: "baja" | "import";
  /** Lista a la que volverá si te suscribes de nuevo (null si no estaba en ninguna o ya no existe). */
  listName: string | null;
  /** Foto del canal (null si aún no se conoce). */
  thumbnail: string | null;
}

export type AddStatus = "added" | "in_catalog" | "subscribed" | "not_found" | "unsupported" | "error";

export interface AddResult {
  input: string;
  status: AddStatus;
  channel?: { channelId: string; title: string; handle: string | null };
}

export interface SubscriptionsResponse {
  subscriptions: Subscription[];
  /** Canales que han pasado al catálogo en esta lectura por haberte dado de baja. */
  catalogued: ChannelRef[];
  /** Canales a los que te has vuelto a suscribir y que han vuelto a su lista. */
  restored: (ChannelRef & { listName: string })[];
  /** Canales quitados de las listas en esta lectura por haberte dado de baja. */
  removed: ChannelRef[];
  /** Canales ausentes que esperan confirmación antes de quitarse (posible fallo de YouTube). */
  pending: PendingChannel[];
}

/** Lo mínimo de un vídeo para resumirlo. */
export type VideoRef = Pick<FeedVideo, "videoId" | "title" | "channelTitle">;

export interface FeedVideo {
  videoId: string;
  title: string;
  channelId: string;
  channelTitle: string;
  published: string;
  thumbnail: string;
}

export interface SummaryResult {
  id: number;
  createdAt: number;
  text: string;
  included: { videoId: string; title: string; channelTitle: string }[];
  skipped: { video: { videoId: string; title: string }; reason: string }[];
  usage: { inputTokens: number; outputTokens: number; costUsd: number };
}
