import { mkdir, readFile, writeFile } from "node:fs/promises";
import { generateYomazinePdf } from "../lib/yomazine-pdf.js";

const originalFetch = globalThis.fetch;
globalThis.fetch = async (resource, options) => {
  if (typeof resource === "string" && resource.startsWith("/fonts/")) {
    return new Response(await readFile(new URL(`../public${resource}`, import.meta.url)));
  }
  return originalFetch(resource, options);
};

const sentence = "言葉を急いで結論へ運ばず、目の前の変化を一つずつ確かめます。「小さな観察」が次の行動を自然に導きます。";
const episodeSentence = "朝の机にノートを置き、気づいた違いを一行だけ記録しました。昼に読み返すと、昨日とは異なる選択が見えてきます。";
const baseArticle = {
  magazineTitle: "観察から始める",
  lead: sentence.repeat(2),
  keyPoints: ["観察を急がない。", "経験と言葉を結ぶ。", "次の一歩を決める。"],
  memorableMoment: sentence.repeat(2),
  episode: episodeSentence.repeat(9),
  discovery: sentence.repeat(2),
  practicalPoints: ["朝に一行を書く。", "昼に変化を見返す。", "週末に次の一歩を決める。"],
  userGoalAnswer: sentence,
  closing: sentence.repeat(2),
};

const imageDataUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const cases = [
  { name: "short-title", article: { ...baseArticle, magazineTitle: "読む力" } },
  { name: "long-title", article: { ...baseArticle, magazineTitle: "静かな観察を毎日の小さな選択へ結び直し、自分の言葉で明日の行動を育てる方法" } },
  { name: "with-image", article: { ...baseArticle, magazineTitle: "画像と文章の余白を読む" }, illustrations: { cover: imageDataUrl, article: imageDataUrl } },
  {
    name: "many-sections",
    article: {
      ...baseArticle,
      magazineTitle: "見出しと本文を離さない編集",
      lead: sentence.repeat(3),
      memorableMoment: sentence.repeat(3),
      discovery: sentence.repeat(3),
      userGoalAnswer: sentence.repeat(3),
      closing: sentence.repeat(3),
    },
  },
  {
    name: "short-tail",
    article: {
      ...baseArticle,
      magazineTitle: "続きを一段だけに残さないための再配置",
      episode: `${episodeSentence.repeat(12)}最後の短い一文です。`,
    },
  },
];

const outputDirectory = new URL("../output/pdf/", import.meta.url);
await mkdir(outputDirectory, { recursive: true });

for (const sample of cases) {
  const result = await generateYomazinePdf({
    article: sample.article,
    illustrations: sample.illustrations || null,
    videoTitle: "観察を習慣に変える方法 - PDFとAIの活用例",
    channelTitle: "暮らしを読む研究室",
    durationSeconds: 1320,
    readingMinutes: 5,
    normalizedUrl: "https://www.youtube.com/watch?v=abcdefghijk",
    pdfOptions: { numericYearStyle: "original" },
  });

  for (const plan of result.layoutDiagnostics.titlePlans) {
    const total = plan.lineLengths.reduce((sum, length) => sum + length, 0);
    const last = plan.lineLengths.at(-1);
    if (plan.lineLengths.length > 1 && (last === 1 || last / total < 0.2)) {
      throw new Error(`${sample.name}: orphaned title line ${JSON.stringify(plan.lineLengths)}`);
    }
  }
  for (const band of result.layoutDiagnostics.continuationBands) {
    if (band.columns < 3 && band.fillRatio < 0.4) {
      throw new Error(`${sample.name}: orphaned continuation ${JSON.stringify(band)}`);
    }
  }

  const outputUrl = new URL(`yomazine-pagination-${sample.name}.pdf`, outputDirectory);
  await writeFile(outputUrl, result.bytes);
  console.log(JSON.stringify({
    output: outputUrl.pathname,
    titles: result.layoutDiagnostics.titlePlans.map(({ location, fontSize, lineLengths }) => ({ location, fontSize, lineLengths })),
    continuationBands: result.layoutDiagnostics.continuationBands,
  }));
}
