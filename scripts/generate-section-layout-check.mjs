import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createArticleSections, generateYomazinePdf, YOMAZINE_SECTION_HEADINGS } from "../lib/yomazine-pdf.js";

const originalFetch = globalThis.fetch;
globalThis.fetch = async (resource, options) => {
  if (typeof resource === "string" && resource.startsWith("/fonts/")) {
    return new Response(await readFile(new URL(`../public${resource}`, import.meta.url)));
  }
  return originalFetch(resource, options);
};

const article = {
  magazineTitle: "小さな観察から、明日の行動へ。",
  lead: "導入の本文です。動画を見たときに生まれた疑問をたどりながら、日常の選択を丁寧に読み直します。「発見」という語が通常の文章中に現れても、ここでは見出しにはなりません。英数字のPDF、AI、2026年、12:30も従来どおり自然に組みます。",
  keyPoints: ["観察を急がない。", "言葉を自分の経験と結ぶ。", "小さな行動へ変換する。"],
  memorableMoment: "話し手が「答えは遠くではなく、いま見えている景色の中にある」と静かに語った場面です。言葉の前後に長い沈黙があり、その余白まで含めて強く印象に残りました。",
  episode: "具体的なエピソードの本文です。朝の机にノートを一冊置き、気づいたことを一行だけ書く試みが紹介されました。最初から正解を探さず、昨日との違いを言葉にすることで、観察は少しずつ深まります。カギ括弧「一行だけ」や句読点、URL表記に近い英数字の送りも確認します。",
  discovery: "大きな変化より先に、変化へ気づける環境をつくることが重要でした。発見は偶然のひらめきだけではなく、小さな違いを記録し続けた結果として現れます。本文中に発見という語がもう一度あっても、追加の見出しにはしません。",
  practicalPoints: [
    "明日の朝、目に入る場所へノートを置く。",
    "気づいた違いを、評価せず一行で記録する。",
    "週末に三つの記録を読み返し、次の一歩を一つ決める。",
  ],
  closing: "読み終えた直後に大きな決意をする必要はありません。まず一冊のノートを置くことから、明日の景色を変える準備は始まります。静かな観察を、無理なく続けていきましょう。",
};

const sections = createArticleSections(article);
const expectedTitles = YOMAZINE_SECTION_HEADINGS.map(({ title }) => title);
if (JSON.stringify(sections.map(({ title }) => title)) !== JSON.stringify(expectedTitles)) {
  throw new Error("section_heading_structure_mismatch");
}
if (sections.some(({ body }) => !body)) throw new Error("section_body_missing");

const result = await generateYomazinePdf({
  article,
  illustrations: null,
  videoTitle: "観察を習慣に変える方法 - PDFとAIの活用例",
  channelTitle: "暮らしを読む研究室",
  durationSeconds: 1320,
  readingMinutes: 5,
  normalizedUrl: "https://www.youtube.com/watch?v=abcdefghijk",
  pdfOptions: { numericYearStyle: "original" },
});

await mkdir(new URL("../output/pdf/", import.meta.url), { recursive: true });
const outputUrl = new URL("../output/pdf/yomazine-section-layout-check.pdf", import.meta.url);
await writeFile(outputUrl, result.bytes);
console.log(outputUrl.pathname);
