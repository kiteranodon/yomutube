import { z } from "zod";

function normalizeSentenceStarts(value) {
  if (typeof value !== "string") return value;
  return value.replace(/(^|\n)[ \t　]*[、。]+[ \t　]*/g, "$1");
}

const text = (minimum, maximum) => z.preprocess(
  normalizeSentenceStarts,
  z.string().trim().min(minimum).max(maximum),
);

export const articleSchema = z.object({
  magazineTitle: text(1, 80),
  lead: text(40, 700),
  keyPoints: z.tuple([text(10, 280), text(10, 280), text(10, 280)]),
  memorableMoment: text(20, 500),
  episode: text(80, 2600),
  discovery: text(80, 2600),
  practicalPoints: z.array(text(10, 320)).min(1).max(8),
  userGoalAnswer: text(40, 1200),
  closing: text(40, 900),
}).strict();

export const ARTICLE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["magazineTitle", "lead", "keyPoints", "memorableMoment", "episode", "discovery", "practicalPoints", "userGoalAnswer", "closing"],
  properties: {
    magazineTitle: { type: "string" },
    lead: { type: "string" },
    keyPoints: { type: "array", minItems: 3, maxItems: 3, items: { type: "string" } },
    memorableMoment: { type: "string" },
    episode: { type: "string" },
    discovery: { type: "string" },
    practicalPoints: { type: "array", minItems: 1, maxItems: 8, items: { type: "string" } },
    userGoalAnswer: { type: "string" },
    closing: { type: "string" },
  },
};

const articleLengthRanges = {
  3: [450, 2200],
  5: [900, 3600],
  10: [1800, 6800],
};

function articleCharacterCount(article) {
  return [
    article.magazineTitle,
    article.lead,
    ...article.keyPoints,
    article.memorableMoment,
    article.episode,
    article.discovery,
    ...article.practicalPoints,
    article.userGoalAnswer,
    article.closing,
  ].join("").replaceAll(/\s/g, "").length;
}

/** Parse and normalize the only article shape that may be persisted. */
export function parseArticle(article, readingMinutes) {
  const parsed = articleSchema.safeParse(article);
  if (!parsed.success) return { error: "記事データの形式または各項目の文字数が正しくありません。" };

  if (readingMinutes) {
    const [minimum, maximum] = articleLengthRanges[readingMinutes] || [];
    const count = articleCharacterCount(parsed.data);
    if (!minimum || count < minimum || count > maximum) return { error: "記事全体の文字数が読書時間に合っていません。" };
  }

  if (JSON.stringify(parsed.data).length > 50000) return { error: "記事データが大きすぎます。" };
  return { article: parsed.data };
}

export function validateArticle(article) {
  return parseArticle(article).error || null;
}

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

export function versionInsert(article, versionNumber) {
  return {
    version_number: versionNumber,
    status: "succeeded",
    article,
    illustration_mode: "not_requested",
    ai_model: "sample-ui-v1",
    prompt_template_version: "sample-v2",
    article_schema_version: "v2",
    completed_at: new Date().toISOString(),
  };
}
