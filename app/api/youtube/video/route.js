import { NextResponse } from "next/server";
import {
  formatDurationJapanese,
  parseYouTubeDuration,
  parseYouTubeVideoUrl,
  YOUTUBE_URL_ERRORS,
} from "../../../../lib/youtube-video";

const GENERIC_ERROR = "動画情報を取得できませんでした。少し時間を置いて再試行してください。";
const NOT_FOUND_ERROR = "動画が見つかりません。公開されているYouTube動画のURLを確認してください。";
const LIVE_ERROR = "ライブ配信・配信予定の動画は雑誌にできません。";
const TOO_LONG_ERROR = "60分を超える動画は対象外です。60分以内の動画を選んでください。";

function errorResponse(message, status) {
  return NextResponse.json({ error: message }, { status });
}

function isQuotaError(response, responseBody) {
  const reasons = responseBody?.error?.errors?.map((item) => item.reason) || [];
  return response.status === 429 || reasons.some((reason) => ["quotaExceeded", "dailyLimitExceeded", "rateLimitExceeded", "userRateLimitExceeded"].includes(reason));
}

function thumbnailUrl(thumbnails) {
  return thumbnails?.maxres?.url || thumbnails?.standard?.url || thumbnails?.high?.url || thumbnails?.medium?.url || thumbnails?.default?.url || "";
}

export async function POST(request) {
  const body = await request.json().catch(() => null);
  const parsedUrl = parseYouTubeVideoUrl(body?.url);
  if (parsedUrl.error) return errorResponse(YOUTUBE_URL_ERRORS[parsedUrl.error], 400);

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return errorResponse(GENERIC_ERROR, 503);

  const endpoint = new URL("https://www.googleapis.com/youtube/v3/videos");
  endpoint.searchParams.set("part", "snippet,contentDetails");
  endpoint.searchParams.set("id", parsedUrl.videoId);
  endpoint.searchParams.set("key", apiKey);

  let response;
  let responseBody;
  try {
    response = await fetch(endpoint, { signal: AbortSignal.timeout(10000) });
    responseBody = await response.json().catch(() => null);
  } catch {
    return errorResponse(GENERIC_ERROR, 503);
  }

  if (!response.ok) {
    if (isQuotaError(response, responseBody)) {
      return errorResponse("YouTube APIの利用上限に達しました。時間を置いてから再試行してください。", 503);
    }
    return errorResponse(GENERIC_ERROR, 503);
  }

  const video = responseBody?.items?.[0];
  if (!video?.id || !video.snippet || !video.contentDetails) return errorResponse(NOT_FOUND_ERROR, 404);

  const liveBroadcastContent = video.snippet.liveBroadcastContent || "none";
  if (["live", "upcoming"].includes(liveBroadcastContent)) return errorResponse(LIVE_ERROR, 422);

  const durationSeconds = parseYouTubeDuration(video.contentDetails.duration);
  if (durationSeconds === null || durationSeconds <= 0) return errorResponse(NOT_FOUND_ERROR, 404);
  if (durationSeconds > 60 * 60) return errorResponse(TOO_LONG_ERROR, 422);

  return NextResponse.json({
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
  });
}
