import { NextResponse } from "next/server";
import { validateArticle, versionInsert } from "../../../../../lib/magazine-validation";
import { getSupabaseRequestContext } from "../../../../../lib/supabase-request";

export async function POST(request, { params }) {
  const context = await getSupabaseRequestContext(request);
  if (context.error) return NextResponse.json({ error: context.error }, { status: context.status });

  const { id } = await params;
  const payload = await request.json().catch(() => null);
  const validationError = validateArticle(payload?.article);
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

  const { data: magazine, error: magazineError } = await context.supabase
    .from("magazines")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (magazineError || !magazine) return NextResponse.json({ error: "対象の雑誌が見つかりません。" }, { status: 404 });

  const { data: latest, error: latestError } = await context.supabase
    .from("magazine_versions")
    .select("version_number")
    .eq("magazine_id", id)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestError) return NextResponse.json({ error: "生成版を確認できませんでした。" }, { status: 500 });

  const { data: version, error: versionError } = await context.supabase
    .from("magazine_versions")
    .insert({ magazine_id: id, ...versionInsert(payload.article, (latest?.version_number ?? 0) + 1) })
    .select("id, version_number, status, completed_at")
    .single();
  if (versionError) return NextResponse.json({ error: "再生成結果を保存できませんでした。" }, { status: 500 });

  return NextResponse.json({ version }, { status: 201 });
}
