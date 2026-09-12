import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import { ARTICLE_JSON_SCHEMA, parseArticle } from "../../../../lib/magazine-validation";
import { getSupabaseRequestContext } from "../../../../lib/supabase-request";
import { getVerifiedYouTubeVideo } from "../../../../lib/youtube-video";

export const runtime = "nodejs";

const TERMS_VERSION = "v1.0";
const PROMPT_TEMPLATE_VERSION = "gemini-magazine-v3";
const ARTICLE_SCHEMA_VERSION = "v2";
const FAILURE_CODES = new Set([
  "gemini_key_missing",
  "gemini_rate_limited",
  "gemini_unavailable",
  "gemini_invalid_response",
  "generation_save_failed",
]);

function errorResponse(error, status) {
  return NextResponse.json({ error }, { status });
}

function inputError(payload) {
  if (!payload || typeof payload !== "object") return "リクエストの形式が正しくありません。";
  const requiredText = ["videoId", "videoUrl", "videoTitle", "channelTitle", "userGoal"];
  if (requiredText.some((key) => typeof payload[key] !== "string" || !payload[key].trim())) return "必要な入力が不足しています。";
  if (!/^[A-Za-z0-9_-]{11}$/.test(payload.videoId)) return "動画IDが正しくありません。";
  if (payload.videoUrl !== `https://www.youtube.com/watch?v=${payload.videoId}`) return "確認済みの動画URLを使用してください。";
  if (!Number.isInteger(payload.videoDurationSeconds) || payload.videoDurationSeconds < 1 || payload.videoDurationSeconds > 3600) return "動画時間が正しくありません。";
  if (![3, 5, 10].includes(payload.readingMinutes)) return "読書時間が正しくありません。";
  if (payload.userGoal.trim().length > 200) return "知りたいことは200文字以内で入力してください。";
  if (payload.magazineId !== undefined && (typeof payload.magazineId !== "string" || !payload.magazineId.trim())) return "雑誌IDが正しくありません。";
  return null;
}

function articlePrompt({ video, userGoal, readingMinutes }) {
  const characterGuide = { 3: "450〜2,200文字", 5: "900〜3,600文字", 10: "1,800〜6,800文字" }[readingMinutes];
  return `あなたは日本語の良質な雑誌編集者です。公開YouTube動画の内容を理解し、視聴者が落ち着いて読める記事を書いてください。

動画情報:
- タイトル: ${video.title}
- チャンネル: ${video.channelTitle}
- 長さ: ${video.durationSeconds}秒
- 読者が知りたいこと: ${userGoal}
- 想定読書時間: 約${readingMinutes}分

記事の条件:
- 「読者が知りたいこと」を記事全体で答える唯一の編集テーマにする。
- タイトル、リード、重要ポイント、場面、エピソード、発見、実践ポイント、結びのすべてを、そのテーマへの回答または回答を支える動画内の根拠に限定する。
- テーマと直接関係しない動画内容、一般的な動画要約、周辺情報は省く。
- userGoalAnswerには、読者が知りたいことへの直接的な回答を、動画内で確認できる内容だけを使って簡潔にまとめる。
- 動画内に十分な回答がない場合、推測で補わず、確認できる範囲と確認できない点をuserGoalAnswerに明記する。
- JSONを返す前に、各フィールドが読者の知りたいことに直接役立つかを確認し、役立たない内容を削る。
- 単なる箇条書き要約にせず、導入・具体的な場面・そこから得られる発見・明日への提案へと流れる雑誌風の文章にする。
- 動画で確認できないことを事実のように補わない。不確かな場合は断定を避ける。
- 直接の長い引用や字幕の転記はしない。動画を再生しなくても読める自然な日本語に言い換える。
- 各フィールドの先頭および改行後の文頭を、読点「、」や句点「。」で始めない。
- keyPointsは必ず3件、practicalPointsは1〜8件にする。
- 全フィールドを合わせた本文量は空白を除いて${characterGuide}を目安にする。
- 指定したJSON以外の文章、Markdown、コードフェンスは返さない。

次のJSONスキーマに厳密に従ってください:
${JSON.stringify(ARTICLE_JSON_SCHEMA)}`;
}

function failureFor(error) {
  const status = Number(error?.status || error?.response?.status || 0);
  if (status === 429) return "gemini_rate_limited";
  return "gemini_unavailable";
}

function publicFailureMessage(code) {
  if (code === "gemini_key_missing") return "記事生成の設定が不足しています。管理者にお問い合わせください。";
  if (code === "gemini_rate_limited") return "記事生成の利用上限に達しています。少し時間を置いて再試行してください。";
  if (code === "gemini_invalid_response") return "記事を整えられませんでした。もう一度生成してください。";
  return "記事を生成できませんでした。少し時間を置いて再試行してください。";
}

async function markFailed(supabase, versionId, failureCode) {
  const safeCode = FAILURE_CODES.has(failureCode) ? failureCode : "generation_save_failed";
  await supabase
    .from("magazine_versions")
    .update({ status: "failed", failure_code: safeCode, completed_at: new Date().toISOString() })
    .eq("id", versionId);
}

async function createGeneratingVersion(supabase, magazineId, versionNumber, model) {
  const { data, error } = await supabase
    .from("magazine_versions")
    .insert({
      magazine_id: magazineId,
      version_number: versionNumber,
      status: "generating",
      illustration_mode: "not_requested",
      ai_model: model,
      prompt_template_version: PROMPT_TEMPLATE_VERSION,
      article_schema_version: ARTICLE_SCHEMA_VERSION,
    })
    .select("id, version_number, status, created_at")
    .single();
  return { version: data, error };
}

function parseModelJson(response) {
  // The current Interactions API exposes snake_case output_text. Keep the
  // camelCase fallback for SDK response normalization across SDK releases.
  const text = response?.output_text || response?.outputText;
  if (typeof text !== "string" || !text.trim()) return null;
  const json = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export async function POST(request) {
  const context = await getSupabaseRequestContext(request);
  if (context.error) return errorResponse(context.error, context.status);
  if (!context.user.is_anonymous) return errorResponse("匿名セッションを確認できません。もう一度お試しください。", 401);

  const payload = await request.json().catch(() => null);
  const requestValidationError = inputError(payload);
  if (requestValidationError) return errorResponse(requestValidationError, 400);

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  const configuredModel = process.env.GEMINI_MODEL?.trim();
  // A failed attempt is still represented by a safe, non-secret version row.
  // The placeholder only exists for the DB's non-empty metadata constraint and
  // is never sent to Gemini.
  const model = configuredModel || "not-configured";

  let magazine;
  let generationInput;
  if (payload.magazineId) {
    const { data, error } = await context.supabase
      .from("magazines")
      .select("id, user_id, video_id, video_url, video_title, channel_title, video_duration_seconds, reading_minutes, user_goal")
      .eq("id", payload.magazineId)
      .eq("user_id", context.user.id)
      .maybeSingle();
    if (error || !data) return errorResponse("対象の雑誌が見つかりません。", 404);
    magazine = data;

    if (
      payload.videoId !== magazine.video_id ||
      payload.videoUrl !== magazine.video_url ||
      payload.videoDurationSeconds !== magazine.video_duration_seconds ||
      payload.readingMinutes !== magazine.reading_minutes ||
      payload.userGoal.trim() !== magazine.user_goal
    ) return errorResponse("再生成する雑誌の条件が一致しません。", 400);
    generationInput = { videoId: magazine.video_id, userGoal: magazine.user_goal, readingMinutes: magazine.reading_minutes };
  } else {
    generationInput = { videoId: payload.videoId, userGoal: payload.userGoal.trim(), readingMinutes: payload.readingMinutes };
  }

  const verified = await getVerifiedYouTubeVideo(generationInput.videoId);
  if (verified.error) return errorResponse(verified.error, verified.status);
  if (payload.videoUrl !== verified.video.normalizedUrl || payload.videoDurationSeconds !== verified.video.durationSeconds) {
    return errorResponse("動画情報が更新されています。もう一度動画を確認してください。", 409);
  }

  if (!magazine) {
    const { data, error } = await context.supabase
      .from("magazines")
      .insert({
        user_id: context.user.id,
        video_id: verified.video.videoId,
        video_url: verified.video.normalizedUrl,
        video_title: verified.video.title,
        channel_title: verified.video.channelTitle,
        video_duration_seconds: verified.video.durationSeconds,
        reading_minutes: generationInput.readingMinutes,
        user_goal: generationInput.userGoal,
        terms_version: TERMS_VERSION,
      })
      .select("id, created_at")
      .single();
    if (error || !data) return errorResponse("雑誌を保存できませんでした。", 500);
    magazine = data;
  }

  const { data: latest, error: latestError } = await context.supabase
    .from("magazine_versions")
    .select("version_number")
    .eq("magazine_id", magazine.id)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestError) return errorResponse("生成版を準備できませんでした。", 500);

  const inserted = await createGeneratingVersion(context.supabase, magazine.id, (latest?.version_number ?? 0) + 1, model);
  if (inserted.error || !inserted.version) return errorResponse("生成版を準備できませんでした。", 500);

  if (!apiKey || !configuredModel) {
    await markFailed(context.supabase, inserted.version.id, "gemini_key_missing");
    return errorResponse(publicFailureMessage("gemini_key_missing"), 503);
  }

  let modelArticle;
  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.interactions.create({
      model,
      input: [
        { type: "video", uri: verified.video.normalizedUrl },
        { type: "text", text: articlePrompt({ video: verified.video, userGoal: generationInput.userGoal, readingMinutes: generationInput.readingMinutes }) },
      ],
    });
    modelArticle = parseModelJson(response);
  } catch (error) {
    const failureCode = failureFor(error);
    await markFailed(context.supabase, inserted.version.id, failureCode);
    return errorResponse(publicFailureMessage(failureCode), failureCode === "gemini_rate_limited" ? 429 : 503);
  }

  const parsedArticle = parseArticle(modelArticle, generationInput.readingMinutes);
  if (parsedArticle.error) {
    await markFailed(context.supabase, inserted.version.id, "gemini_invalid_response");
    return errorResponse(publicFailureMessage("gemini_invalid_response"), 502);
  }

  const { data: version, error: saveError } = await context.supabase
    .from("magazine_versions")
    .update({ status: "succeeded", article: parsedArticle.article, completed_at: new Date().toISOString() })
    .eq("id", inserted.version.id)
    .select("id, version_number, status, completed_at")
    .single();
  if (saveError || !version) {
    await markFailed(context.supabase, inserted.version.id, "generation_save_failed");
    return errorResponse(publicFailureMessage("generation_save_failed"), 500);
  }

  return NextResponse.json({ magazine: { id: magazine.id, created_at: magazine.created_at }, version, article: parsedArticle.article }, { status: 201 });
}
