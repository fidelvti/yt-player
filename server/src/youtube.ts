import type { OAuth2Client } from "google-auth-library";

const API = "https://www.googleapis.com/youtube/v3";

export interface Subscription {
  channelId: string;
  title: string;
  thumbnail: string;
}

interface SubscriptionsResponse {
  nextPageToken?: string;
  items: {
    snippet: {
      title: string;
      resourceId: { channelId: string };
      thumbnails: { default?: { url: string } };
    };
  }[];
}

/** Todas las suscripciones del usuario, paginando de 50 en 50. */
export async function listSubscriptions(client: OAuth2Client): Promise<Subscription[]> {
  const result: Subscription[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL(`${API}/subscriptions`);
    url.searchParams.set("part", "snippet");
    url.searchParams.set("mine", "true");
    url.searchParams.set("maxResults", "50");
    url.searchParams.set("order", "alphabetical");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const res = await client.request<SubscriptionsResponse>({ url: url.toString() });
    for (const item of res.data.items) {
      result.push({
        channelId: item.snippet.resourceId.channelId,
        title: item.snippet.title,
        thumbnail: item.snippet.thumbnails.default?.url ?? "",
      });
    }
    pageToken = res.data.nextPageToken;
  } while (pageToken);

  return result;
}
