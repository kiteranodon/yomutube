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
  episode: [
    "第一の記録。朝の机にノートを一冊置き、気づいたことを一行だけ書く試みが紹介されました。最初から正解を探さず、昨日との違いを言葉にすることで、観察は少しずつ深まります。",
    "第二の記録。昼には書いた一行を見返し、行動が変わった瞬間を短く付け足します。上段を読み終えた後は、中段の右端へ戻って続きを読む流れを確認します。",
    "第三の記録。夕方にはAIへ頼る前に、自分の言葉で変化を説明します。「一行だけ」というカギ括弧、句点。読点、の送り幅も段の境界で変わりません。",
    "第四の記録。英単語Yomazine、PDF、2026年、12:30、メールtest@example.com、URL https://example.com/reading を含め、余分な空白や不自然な分割がないことを確かめます。",
    "第五の記録。中段を読み終えたら下段の右端へ戻ります。各段は独立した縦書き領域なので、左端同士がつながることはありません。文字も区切り線を越えません。",
    "第六の記録。下段まで読み終えた後は、次ページの上段右端から続きを始めます。ページ番号やサイドバー、画像の領域を避けながら、本文だけが三段を順に進みます。",
    "第七の記録。長い記事でも読み順は上段、中段、下段、次ページ上段です。段が変わるたびに右端へ視線を戻せるため、縦書きの自然な流れを保てます。",
    "第八の記録。最後に、禁則処理と約物の字形位置を確認します。「始まり」と「終わり」、句読点、英数字の中央配置は、従来の描画処理をそのまま利用しています。",
  ].join(""),
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
const outputUrl = new URL("../output/pdf/yomazine-three-band-layout-check.pdf", import.meta.url);
await writeFile(outputUrl, result.bytes);
console.log(outputUrl.pathname);
