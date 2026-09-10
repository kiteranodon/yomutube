import { NextResponse } from "next/server";
import { getSupabaseRequestContext } from "../../../../lib/supabase-request";

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
