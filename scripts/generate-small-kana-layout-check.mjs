import { mkdir, readFile, writeFile } from "node:fs/promises";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { drawVerticalText, isSmallKana } from "../lib/yomazine-pdf.js";

const expectedSmallKana = Array.from("ぁぃぅぇぉっゃゅょゎゕゖァィゥェォッャュョヮヵヶㇰㇱㇲㇳㇴㇵㇶㇷㇸㇹㇺㇻㇼㇽㇾㇿｧｨｩｪｫｬｭｮｯ");
const ordinaryKana = Array.from("あいうえおつやゆよわかけアイウエオツヤユヨワカケ");
if (expectedSmallKana.some((character) => !isSmallKana(character))) throw new Error("small_kana_class_missing_character");
if (ordinaryKana.some((character) => isSmallKana(character))) throw new Error("small_kana_class_contains_ordinary_character");

const debug = process.argv.includes("--debug");
const pdf = await PDFDocument.create();
pdf.registerFontkit(fontkit);
const fontBytes = await readFile(new URL("../public/fonts/noto-serif-jp.ttf", import.meta.url));
const [font, smallKanaFont, latinFont] = await Promise.all([
  pdf.embedFont(fontBytes, { subset: false }),
  pdf.embedFont(fontBytes, { subset: false, features: { vert: true, vrt2: true } }),
  pdf.embedFont(StandardFonts.Helvetica),
]);
const horizontalSource = font.embedder.font;
const verticalSource = smallKanaFont.embedder.font;
for (const character of expectedSmallKana.filter((value) => !/^[ｧ-ｯ]$/u.test(value))) {
  const horizontalGlyph = horizontalSource.layout(character).glyphs[0];
  const verticalGlyph = verticalSource.layout(character, ["vert", "vrt2"]).glyphs[0];
  const horizontalCenter = {
    x: (horizontalGlyph.bbox.minX + horizontalGlyph.bbox.maxX) / 2,
    y: (horizontalGlyph.bbox.minY + horizontalGlyph.bbox.maxY) / 2,
  };
  const verticalCenter = {
    x: (verticalGlyph.bbox.minX + verticalGlyph.bbox.maxX) / 2,
    y: (verticalGlyph.bbox.minY + verticalGlyph.bbox.maxY) / 2,
  };
  if (horizontalGlyph.id === verticalGlyph.id || verticalCenter.x <= horizontalCenter.x || verticalCenter.y <= horizontalCenter.y) {
    throw new Error(`font_vertical_alternate_is_not_upper_right_${character}`);
  }
}

const samples = [
  "きゃく、きゅう、きょう。",
  "しゃしん、しゅくだい、しょうらい。",
  "ちゃわん、ちゅうい、ちょっと。",
  "あっという間に終わった。",
  "ファッション、ティッシュ、キャッシュ、ウォッチ。",
  "ヴァイオリン、ティーカップ、ウェブサイト。",
  "「ちょっと待って」と言った。",
];

const page = pdf.addPage([595.28, 841.89]);
page.drawText(debug ? "VERTICAL SMALL KANA / red = small-kana cell" : "VERTICAL SMALL KANA", { x: 42, y: 810, font: latinFont, size: 9, color: rgb(0.25, 0.28, 0.22) });
samples.forEach((sample, index) => {
  const right = 552 - index * 73;
  const result = drawVerticalText(page, sample, {
    font,
    smallKanaFont,
    latinFont,
    fontSize: 20,
    right,
    left: right - 20,
    top: 780,
    bottom: 90,
    maxColumns: 1,
    columnGap: 0,
    debugCellGuides: debug,
  });
  if (!result.fits || result.columns !== 1) throw new Error(`verification_sample_did_not_fit_${index + 1}`);
});

const inventoryPage = pdf.addPage([595.28, 841.89]);
inventoryPage.drawText("SMALL KANA INVENTORY", { x: 42, y: 810, font: latinFont, size: 9, color: rgb(0.25, 0.28, 0.22) });
drawVerticalText(inventoryPage, expectedSmallKana.join(""), {
  font,
  smallKanaFont,
  latinFont,
  fontSize: 22,
  right: 540,
  left: 60,
  top: 780,
  bottom: 90,
  columnGap: 14,
  debugCellGuides: debug,
});

const horizontalPage = pdf.addPage([595.28, 841.89]);
horizontalPage.drawText("HORIZONTAL CONTROL / no vertical-kana font", { x: 42, y: 810, font: latinFont, size: 9, color: rgb(0.25, 0.28, 0.22) });
horizontalPage.drawText(samples.join(" "), { x: 42, y: 760, font, size: 12, color: rgb(0.09, 0.13, 0.07), maxWidth: 510, lineHeight: 22 });

await mkdir(new URL(debug ? "../tmp/pdfs/" : "../output/pdf/", import.meta.url), { recursive: true });
const outputUrl = new URL(
  debug ? "../tmp/pdfs/yomazine-small-kana-debug.pdf" : "../output/pdf/yomazine-small-kana-layout-check.pdf",
  import.meta.url,
);
await writeFile(outputUrl, await pdf.save());
console.log(outputUrl.pathname);
