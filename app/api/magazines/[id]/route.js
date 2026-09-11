import { NextResponse } from "next/server";
import { getSupabaseRequestContext } from "../../../../lib/supabase-request";

export async function GET(request, { params }) {
  const context = await getSupabaseRequestContext(request);
  if (context.error) return NextResponse.json({ error: context.error }, { status: context.status });

  const { id } = await params;
  const { data: magazine, error } = await context.supabase
    .from("magazines")
    .select("id, video_id, video_url, video_title, channel_title, video_duration_seconds, reading_minutes, user_goal, magazine_versions(id, version_number, status, article, illustration_mode, created_at, completed_at)")
    .eq("id", id)
    .maybeSingle();

  if (error || !magazine) return NextResponse.json({ error: "対象の履歴が見つかりません。" }, { status: 404 });
  const version = [...magazine.magazine_versions]
    .filter((item) => item.status === "succeeded" && item.article)
    .sort((a, b) => b.version_number - a.version_number)[0];
  if (!version) return NextResponse.json({ error: "表示できる記事が見つかりません。" }, { status: 404 });

  return NextResponse.json({ magazine: { ...magazine, magazine_versions: undefined }, version });
}

export async function DELETE(request, { params }) {
  const context = await getSupabaseRequestContext(request);
  if (context.error) return NextResponse.json({ error: context.error }, { status: context.status });

  const { id } = await params;
  const { data, error } = await context.supabase
    .from("magazines")
    .delete()
    .eq("id", id)
    .select("id");

  if (error) return NextResponse.json({ error: "履歴を削除できませんでした。" }, { status: 500 });
  if (!data?.length) return NextResponse.json({ error: "対象の履歴が見つかりません。" }, { status: 404 });
  return NextResponse.json({ deletedId: id });
}
