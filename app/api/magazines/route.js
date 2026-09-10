import { NextResponse } from "next/server";
import { validateMagazinePayload, versionInsert } from "../../../lib/magazine-validation";
import { getSupabaseRequestContext } from "../../../lib/supabase-request";

export async function GET(request) {
  const context = await getSupabaseRequestContext(request);
  if (context.error) return NextResponse.json({ error: context.error }, { status: context.status });

  const { data, error } = await context.supabase
    .from("magazines")
    .select("id, video_title, channel_title, video_minutes, reading_minutes, saved_minutes, user_goal, created_at, expires_at, magazine_versions(id, version_number, status, article, created_at, completed_at)")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: "履歴を読み込めませんでした。" }, { status: 500 });

  const magazines = data.map((magazine) => ({
    ...magazine,
    latestVersion: [...magazine.magazine_versions].sort((a, b) => b.version_number - a.version_number)[0] ?? null,
    magazine_versions: undefined,
  }));
  return NextResponse.json({ magazines });
}

export async function POST(request) {
  const context = await getSupabaseRequestContext(request);
  if (context.error) return NextResponse.json({ error: context.error }, { status: context.status });

  const payload = await request.json().catch(() => null);
  const validationError = validateMagazinePayload(payload);
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

  const { data: magazine, error: magazineError } = await context.supabase
    .from("magazines")
    .insert({
      user_id: context.user.id,
      video_id: payload.videoId,
      video_url: payload.videoUrl,
      video_title: payload.videoTitle.trim(),
      channel_title: payload.channelTitle.trim(),
      video_duration_seconds: payload.videoDurationSeconds,
      reading_minutes: payload.readingMinutes,
      user_goal: payload.userGoal.trim(),
      terms_version: payload.termsVersion,
    })
    .select("id, created_at")
    .single();

  if (magazineError) return NextResponse.json({ error: "雑誌を保存できませんでした。" }, { status: 500 });

  const { data: version, error: versionError } = await context.supabase
    .from("magazine_versions")
    .insert({ magazine_id: magazine.id, ...versionInsert(payload.article, 1) })
    .select("id, version_number, status, completed_at")
    .single();

  if (versionError) return NextResponse.json({ error: "記事を保存できませんでした。" }, { status: 500 });
  return NextResponse.json({ magazine, version }, { status: 201 });
}
