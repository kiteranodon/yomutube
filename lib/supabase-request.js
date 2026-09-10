import { createClient } from "@supabase/supabase-js";

export async function getSupabaseRequestContext(request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const authorization = request.headers.get("authorization");

  if (!url || !anonKey) {
    return { error: "Supabaseの環境変数が設定されていません。", status: 500 };
  }

  if (!authorization?.startsWith("Bearer ")) {
    return { error: "匿名セッションを確認できません。もう一度お試しください。", status: 401 };
  }

  const token = authorization.slice("Bearer ".length);
  const supabase = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: authorization } },
  });
  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    return { error: "匿名セッションを確認できません。もう一度お試しください。", status: 401 };
  }

  return { supabase, user: data.user };
}
