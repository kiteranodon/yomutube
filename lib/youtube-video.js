const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

export const YOUTUBE_URL_ERRORS = {
  invalid: "YouTubeの通常動画URLを入力してください。",
  playlist: "再生リストではなく、通常動画のURLを入力してください。",
  shorts: "Shortsは現在対象外です。通常動画のURLを入力してください。",
};

export const YOUTUBE_VIDEO_ERRORS = {
  generic: "動画情報を取得できませんでした。少し時間を置いて再試行してください。",
  notFound: "動画が見つかりません。公開されているYouTube動画のURLを確認してください。",
  live: "ライブ配信・配信予定の動画は雑誌にできません。",
  tooLong: "60分を超える動画は対象外です。60分以内の動画を選んでください。",
};

/**
 * Accept only the two normal-video URL formats supported by this app.
 * Query parameters used for tracking are allowed, but playlist URLs are not.
 */
export function parseYouTubeVideoUrl(value) {
  if (typeof value !== "string" || !value.trim()) return { error: "invalid" };

  let parsed;
  try {
    parsed = new URL(value.trim());
  } catch {
    return { error: "invalid" };
  }

  if (parsed.protocol !== "https:" || parsed.username || parsed.password) return { error: "invalid" };
  if (parsed.searchParams.has("list")) return { error: "playlist" };

  if (["youtube.com", "www.youtube.com"].includes(parsed.hostname)) {
    if (parsed.pathname.startsWith("/shorts/")) return { error: "shorts" };
    if (parsed.pathname !== "/watch") return { error: "invalid" };

    const videoId = parsed.searchParams.get("v");
    if (!VIDEO_ID_PATTERN.test(videoId || "")) return { error: "invalid" };
    return { videoId };
  }

  if (parsed.hostname === "youtu.be") {
    const videoId = parsed.pathname.slice(1);
    if (!VIDEO_ID_PATTERN.test(videoId)) return { error: "invalid" };
    return { videoId };
  }

  return { error: "invalid" };
}

export function parseYouTubeDuration(duration) {
  if (typeof duration !== "string") return null;
  const match = duration.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!match || !match.slice(1).some((part) => part !== undefined)) return null;

  const [, days = "0", hours = "0", minutes = "0", seconds = "0"] = match;
  const total = Number(days) * 86400 + Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
  return Number.isSafeInteger(total) && total >= 0 ? total : null;
}

export function formatDurationJapanese(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts = [];

  if (hours) parts.push(`${hours}時間`);
  if (minutes || hours) parts.push(`${minutes}分`);
  if (seconds || parts.length === 0) parts.push(`${seconds}秒`);
  return parts.join("");
}

function isQuotaError(response, responseBody) {
  const reasons = responseBody?.error?.errors?.map((item) => item.reason) || [];
  return response.status === 429 || reasons.some((reason) => ["quotaExceeded", "dailyLimitExceeded", "rateLimitExceeded", "userRateLimitExceeded"].includes(reason));
}

function thumbnailUrl(thumbnails) {
  return thumbnails?.maxres?.url || thumbnails?.standard?.url || thumbnails?.high?.url || thumbnails?.medium?.url || thumbnails?.default?.url || "";
}

/**
 * Fetch the canonical public-video snapshot on the server. This is shared by
 * URL confirmation and article generation so client-supplied video metadata is
 * never the source of truth.
 */
export async function getVerifiedYouTubeVideo(videoId) {
  if (!VIDEO_ID_PATTERN.test(videoId || "")) return { error: YOUTUBE_URL_ERRORS.invalid, status: 400 };

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return { error: YOUTUBE_VIDEO_ERRORS.generic, status: 503 };

  const endpoint = new URL("https://www.googleapis.com/youtube/v3/videos");
  endpoint.searchParams.set("part", "snippet,contentDetails");
  endpoint.searchParams.set("id", videoId);
  endpoint.searchParams.set("key", apiKey);

  let response;
  let responseBody;
  try {
    response = await fetch(endpoint, { signal: AbortSignal.timeout(10000) });
    responseBody = await response.json().catch(() => null);
  } catch {
    return { error: YOUTUBE_VIDEO_ERRORS.generic, status: 503 };
  }

  if (!response.ok) {
    return {
      error: isQuotaError(response, responseBody) ? "YouTube APIの利用上限に達しました。時間を置いてから再試行してください。" : YOUTUBE_VIDEO_ERRORS.generic,
      status: 503,
    };
  }

  const video = responseBody?.items?.[0];
  if (!video?.id || !video.snippet || !video.contentDetails) return { error: YOUTUBE_VIDEO_ERRORS.notFound, status: 404 };

  const liveBroadcastContent = video.snippet.liveBroadcastContent || "none";
  if (["live", "upcoming"].includes(liveBroadcastContent)) return { error: YOUTUBE_VIDEO_ERRORS.live, status: 422 };

  const durationSeconds = parseYouTubeDuration(video.contentDetails.duration);
  if (durationSeconds === null || durationSeconds <= 0) return { error: YOUTUBE_VIDEO_ERRORS.notFound, status: 404 };
  if (durationSeconds > 60 * 60) return { error: YOUTUBE_VIDEO_ERRORS.tooLong, status: 422 };

  return {
    video: {
      videoId: video.id,
      normalizedUrl: `https://www.youtube.com/watch?v=${video.id}`,
      title: video.snippet.title || "タイトル未設定",
      channelTitle: video.snippet.channelTitle || "チャンネル名未設定",
      thumbnailUrl: thumbnailUrl(video.snippet.thumbnails),
      durationSeconds,
      durationLabel: formatDurationJapanese(durationSeconds),
      liveBroadcastContent,
    },
  };
}
