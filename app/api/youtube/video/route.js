import { NextResponse } from "next/server";
import {
  getVerifiedYouTubeVideo,
  parseYouTubeVideoUrl,
  YOUTUBE_URL_ERRORS,
} from "../../../../lib/youtube-video";

function errorResponse(message, status) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request) {
  const body = await request.json().catch(() => null);
  const parsedUrl = parseYouTubeVideoUrl(body?.url);
  if (parsedUrl.error) return errorResponse(YOUTUBE_URL_ERRORS[parsedUrl.error], 400);

  const result = await getVerifiedYouTubeVideo(parsedUrl.videoId);
  if (result.error) return errorResponse(result.error, result.status);
  return NextResponse.json({ video: result.video });
}
