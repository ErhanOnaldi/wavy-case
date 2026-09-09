import type { platforms } from "@/features/shared";

export type PostIdentity = {
  platform: (typeof platforms)[number];
  externalPostId: string;
  postUrl: string;
};

export function parsePostUrl(raw: string): PostIdentity | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port)
    return null;
  const host = url.hostname.toLowerCase();

  if (["tiktok.com", "www.tiktok.com"].includes(host)) {
    const match = /^\/@([\w.]{1,32})\/video\/(\d{15,22})\/?$/.exec(
      url.pathname,
    );
    if (match)
      return {
        platform: "tiktok",
        externalPostId: match[2],
        postUrl: `https://www.tiktok.com/@${match[1]}/video/${match[2]}`,
      };
  }
  if (["instagram.com", "www.instagram.com"].includes(host)) {
    const match = /^\/(p|reel)\/([A-Za-z0-9_-]{5,32})\/?$/.exec(url.pathname);
    if (match)
      return {
        platform: "instagram",
        externalPostId: match[2],
        postUrl: `https://www.instagram.com/${match[1]}/${match[2]}/`,
      };
  }
  let videoId: string | undefined;
  if (host === "youtu.be")
    videoId = /^\/([\w-]{11})\/?$/.exec(url.pathname)?.[1];
  if (["youtube.com", "www.youtube.com", "m.youtube.com"].includes(host)) {
    if (
      url.pathname === "/watch" &&
      url.searchParams.getAll("v").length === 1
    ) {
      const value = url.searchParams.get("v")!;
      if (/^[\w-]{11}$/.test(value)) videoId = value;
    } else videoId = /^\/shorts\/([\w-]{11})\/?$/.exec(url.pathname)?.[1];
  }
  if (videoId)
    return {
      platform: "youtube",
      externalPostId: videoId,
      postUrl: `https://www.youtube.com/watch?v=${videoId}`,
    };
  return null;
}
