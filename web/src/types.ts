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

export interface SubscriptionsResponse {
  subscriptions: Subscription[];
  /** Canales quitados de las listas por haberte dado de baja. */
  pruned: number;
  pruneSkipped?: { wouldRemove: number; total: number };
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
