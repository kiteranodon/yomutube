const articleKeys = [
  "magazineTitle",
  "lead",
  "keyPoints",
  "memorableMoment",
  "episode",
  "discovery",
  "practicalPoints",
  "closing",
];

export function validateMagazinePayload(payload) {
  const requiredText = ["videoId", "videoUrl", "videoTitle", "channelTitle", "userGoal", "termsVersion"];

  if (!payload || typeof payload !== "object") return "リクエストの形式が正しくありません。";
  if (requiredText.some((key) => typeof payload[key] !== "string" || !payload[key].trim())) return "必要な入力が不足しています。";
  if (!/^[A-Za-z0-9_-]{11}$/.test(payload.videoId)) return "動画IDが正しくありません。";
  if (payload.videoUrl !== `https://www.youtube.com/watch?v=${payload.videoId}`) return "動画URLが正しくありません。";
  if (!Number.isInteger(payload.videoDurationSeconds) || payload.videoDurationSeconds < 1 || payload.videoDurationSeconds > 3600) return "動画時間が対象外です。";
  if (![3, 5, 10].includes(payload.readingMinutes)) return "読書時間が正しくありません。";
  if (payload.userGoal.trim().length > 200) return "知りたいことは200文字以内で入力してください。";

  return validateArticle(payload.article);
}

export function validateArticle(article) {
  if (!article || typeof article !== "object") return "記事データがありません。";
  if (articleKeys.some((key) => !(key in article))) return "記事データが不完全です。";
  if (articleKeys.filter((key) => !["keyPoints", "practicalPoints"].includes(key)).some((key) => typeof article[key] !== "string" || !article[key].trim())) return "記事データが不完全です。";
  if (!Array.isArray(article.keyPoints) || article.keyPoints.length !== 3 || article.keyPoints.some((point) => typeof point !== "string" || !point.trim())) return "重要ポイントは3件必要です。";
  if (!Array.isArray(article.practicalPoints) || article.practicalPoints.length === 0 || article.practicalPoints.some((point) => typeof point !== "string" || !point.trim())) return "実践ポイントが必要です。";
  if (JSON.stringify(article).length > 50000) return "記事データが大きすぎます。";
  return null;
}

export function versionInsert(article, versionNumber) {
  return {
    version_number: versionNumber,
    status: "succeeded",
    article,
    illustration_mode: "not_requested",
    ai_model: "sample-ui-v1",
    prompt_template_version: "sample-v1",
    article_schema_version: "v1",
    completed_at: new Date().toISOString(),
  };
}
