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
