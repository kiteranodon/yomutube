const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

export const YOUTUBE_URL_ERRORS = {
  invalid: "YouTubeの通常動画URLを入力してください。",
  playlist: "再生リストではなく、通常動画のURLを入力してください。",
  shorts: "Shortsは現在対象外です。通常動画のURLを入力してください。",
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
