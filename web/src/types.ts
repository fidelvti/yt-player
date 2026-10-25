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
