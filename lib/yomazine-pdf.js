import { PDFDocument, degrees, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";

const A4 = [595.28, 841.89];
const MARGIN = 42;
const MIN_BODY_SIZE = 7;
const INK = rgb(0.09, 0.13, 0.07);
const MUTED = rgb(0.34, 0.38, 0.3);
const ACCENT = rgb(0.74, 0.94, 0.2);
const ACCENT_DARK = rgb(0.28, 0.39, 0.08);
const PANEL = rgb(0.95, 0.96, 0.91);
const PAPER = rgb(0.985, 0.985, 0.96);

const verticalPunctuation = new Set(["、", "。", "，", "．", "：", "；", "！", "？"]);
const verticalJapanesePunctuation = new Map([
  ["、", "︑"],
  ["。", "︒"],
]);
const prohibitedAtColumnStart = new Set(["、", "。"]);
const verticalLineCharacters = new Set(["ー", "ｰ", "―", "−", "‐", "–", "—"]);
const latinCharacters = /[A-Za-z0-9@#%&*+=_\-:/?.'()[\]]/;
const openingBrackets = new Set(["（", "［", "｛", "「", "『", "【", "〈", "《", "〔"]);
const closingBrackets = new Set(["）", "］", "｝", "」", "』", "】", "〉", "》", "〕"]);

function cleanText(value) {
  return String(value || "").replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();
}

function drawVerticalGlyph(page, character, options) {
  const { font, fontSize, x, y, color = INK } = options;
  const isPunctuation = verticalPunctuation.has(character);
  const verticalPunctuationGlyph = verticalJapanesePunctuation.get(character);
  const isVerticalLine = verticalLineCharacters.has(character);
  const isOpening = openingBrackets.has(character);
  const isClosing = closingBrackets.has(character);

  if (verticalPunctuationGlyph) {
    // Use the font's dedicated vertical presentation forms. Their ink sits
    // in the upper-right of the full-width em, as Japanese vertical setting
    // requires, without an ad-hoc offset that varies between punctuation.
    page.drawText(verticalPunctuationGlyph, {
      x: x - fontSize * 0.5,
      y,
      font,
      size: fontSize,
      color,
    });
  } else if (isVerticalLine) {
    // Use the embedded Japanese font's CJK vertical-stroke glyph. Unlike a
    // generic bar, it carries the subtle start/end treatment of the Mincho
    // face and therefore blends with the surrounding Japanese text.
    const replacement = "丨";
    const replacementSize = fontSize * 0.92;
    const replacementWidth = font.widthOfTextAtSize(replacement, replacementSize);
    page.drawText(replacement, {
      x: x - replacementWidth / 2,
      y: y - fontSize * 0.03,
      font,
      size: replacementSize,
      color,
    });
  } else if (isOpening || isClosing) {
    page.drawText(character, { x: x - fontSize * 0.05, y: y - fontSize * 0.08, font, size: fontSize, color, rotate: degrees(90) });
  } else {
    // CJK glyphs in the embedded font share a full-width em. Keeping the
    // column origin fixed is important: measuring a subset glyph separately
    // can introduce horizontal wobble in some PDF readers.
    page.drawText(character, { x: x - fontSize * 0.5 + (isPunctuation ? fontSize * 0.19 : 0), y: y + (isPunctuation ? fontSize * 0.15 : 0), font, size: fontSize, color });
  }
}

function verticalTokens(value) {
  const tokens = [];
  let latinRun = "";
  const flushLatin = () => {
    if (latinRun) tokens.push({ type: "latin", value: latinRun });
    latinRun = "";
  };
  for (const character of cleanText(value)) {
    if (latinCharacters.test(character)) {
      latinRun += character;
      continue;
    }
    flushLatin();
    if (character === "\n") tokens.push({ type: "break", value: character });
    else if (character === " ") tokens.push({ type: "space", value: character });
    else tokens.push({ type: "glyph", value: character });
  }
  flushLatin();
  return tokens;
}

function tokenAdvance(token, font, fontSize) {
  const lineAdvance = fontSize * 1.18;
  if (token.type === "break") return lineAdvance * 1.5;
  if (token.type === "space") return lineAdvance * 0.55;
  if (token.type === "latin") {
    // A rotated Latin run extends downward by its horizontal text width.
    // Reserve a complete following cell so the next Japanese glyph cannot
    // overlap the end of the run.
    return font.widthOfTextAtSize(token.value, fontSize * 0.78) + lineAdvance;
  }
  return lineAdvance;
}

function shouldWrapBeforeToken(tokens, index, remaining, columnHeight, font, fontSize) {
  const token = tokens[index];
  const advance = tokenAdvance(token, font, fontSize);
  const isProhibitedPunctuation = token.type === "glyph" && prohibitedAtColumnStart.has(token.value);
  if (!isProhibitedPunctuation && advance > remaining && remaining < columnHeight) return true;

  // Japanese punctuation must stay with the glyph before it. If the current
  // glyph fits but its following comma/full stop does not, move the pair to
  // the next vertical column instead of leaving punctuation at the top.
  if (token.type !== "break" && token.type !== "space" && !isProhibitedPunctuation) {
    let groupAdvance = advance;
    let nextIndex = index + 1;
    while (tokens[nextIndex]?.type === "glyph" && prohibitedAtColumnStart.has(tokens[nextIndex].value)) {
      groupAdvance += tokenAdvance(tokens[nextIndex], font, fontSize);
      nextIndex += 1;
    }
    if (groupAdvance > remaining && groupAdvance <= columnHeight && remaining < columnHeight) return true;
  }

  return false;
}

function verticalColumnCount(text, font, fontSize, height) {
  const columnHeight = Math.max(fontSize, height - fontSize);
  const tokens = verticalTokens(text);
  let columns = 1;
  let remaining = columnHeight;
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const advance = tokenAdvance(token, font, fontSize);
    if (shouldWrapBeforeToken(tokens, index, remaining, columnHeight, font, fontSize)) {
      columns += 1;
      remaining = columnHeight;
    }
    if (advance > columnHeight) return Number.POSITIVE_INFINITY;
    remaining -= advance;
  }
  return columns;
}

/**
 * Draws Japanese vertical type one glyph at a time. Columns begin at `right`
 * and move left, which avoids relying on a horizontal text rotation shortcut.
 */
export function drawVerticalText(page, value, options) {
  const text = cleanText(value);
  const tokens = verticalTokens(text);
  const { font, fontSize, right, top, bottom, left = MARGIN, columnGap = 3, color = INK, maxColumns } = options;
  const lineAdvance = fontSize * 1.18;
  const columnAdvance = fontSize + columnGap;
  const usableHeight = top - bottom;
  const availableColumns = maxColumns || Math.floor((right - left) / columnAdvance);
  const neededColumns = verticalColumnCount(text, font, fontSize, usableHeight);
  if (neededColumns > availableColumns) return { fits: false, neededColumns, availableColumns };

  let x = right - fontSize / 2;
  let y = top - fontSize;
  let columns = 1;
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const advance = tokenAdvance(token, font, fontSize);
    const remaining = y - bottom;
    if (shouldWrapBeforeToken(tokens, index, remaining, usableHeight - fontSize, font, fontSize)) {
      x -= columnAdvance;
      y = top - fontSize;
      columns += 1;
    }
    if (token.type === "glyph") {
      drawVerticalGlyph(page, token.value, { font, fontSize, x, y, color });
    } else if (token.type === "latin") {
      // Keep every Latin/number run in the same horizontal writing direction,
      // rotated clockwise as one block inside the vertical column. The token
      // advance reserves its measured length plus a complete following cell.
      page.drawText(token.value, {
        x: x - fontSize * 0.38,
        y,
        font,
        size: fontSize * 0.78,
        color,
        rotate: degrees(-90),
      });
    }
    y -= advance;
  }
  return { fits: true, columns };
}

function dateParts(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  return { iso: local, label: local.replaceAll("-", ".") };
}

function fallbackArticle(article) {
  return {
    magazineTitle: article?.magazineTitle || "読むための小さな雑誌",
    lead: article?.lead || "記事を読みやすい雑誌の形に整えました。",
    keyPoints: Array.isArray(article?.keyPoints) ? article.keyPoints : [],
    memorableMoment: article?.memorableMoment || "印象に残った場面を、ここで読み返します。",
    episode: article?.episode || "具体的なエピソードを、本文として記録します。",
    discovery: article?.discovery || "動画から得た発見を、自分の言葉で確かめます。",
    practicalPoints: Array.isArray(article?.practicalPoints) ? article.practicalPoints : [],
    closing: article?.closing || "次の一歩を、静かに始めましょう。",
  };
}

function sizeForText(text, width, height, maximum, minimum, font, columnGap = 3) {
  for (let size = maximum; size >= minimum; size -= 0.5) {
    if (verticalColumnCount(text, font, size, height) * (size + columnGap) <= width) return size;
  }
  return null;
}

function fitVerticalText(page, text, options) {
  const { font, right, left, top, bottom, maximum = 12, minimum = MIN_BODY_SIZE, columnGap = 4 } = options;
  const fontSize = sizeForText(text, right - left, top - bottom, maximum, minimum, font, columnGap);
  if (!fontSize) return false;
  drawVerticalText(page, text, { ...options, fontSize, columnGap });
  return true;
}

function drawPageHeading(page, title, font) {
  page.drawRectangle({ x: 482, y: 118, width: 58, height: 618, color: PANEL });
  page.drawRectangle({ x: 522, y: 118, width: 18, height: 82, color: ACCENT });
  drawVerticalText(page, title, { font, fontSize: 17, right: 525, top: 712, bottom: 245, left: 492, columnGap: 7 });
}

function drawPanel(page, box, color = PANEL) {
  page.drawRectangle({ ...box, color });
  page.drawRectangle({ x: box.x + box.width - 5, y: box.y, width: 5, height: box.height, color: ACCENT });
}

function japaneseNumber(value) {
  const digits = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
  const number = Math.max(0, Math.floor(Number(value) || 0));
  if (number < 10) return digits[number];
  if (number < 20) return `十${number % 10 ? digits[number % 10] : ""}`;
  if (number < 100) return `${digits[Math.floor(number / 10)]}十${number % 10 ? digits[number % 10] : ""}`;
  return String(number);
}

function drawRotatedLatinLine(page, text, options) {
  const { font, fontSize, x, top, maxLength, color = MUTED } = options;
  const value = cleanText(text);
  let fittedSize = fontSize;
  while (fittedSize > 5 && font.widthOfTextAtSize(value, fittedSize) > maxLength) fittedSize -= 0.5;
  if (font.widthOfTextAtSize(value, fittedSize) > maxLength) return false;
  page.drawText(value, { x: x - fittedSize * 0.38, y: top, font, size: fittedSize, color, rotate: degrees(-90) });
  return true;
}

function addPageBase(pdf, pageNumber, dateLabel, footerFont) {
  const page = pdf.addPage(A4);
  const [width, height] = A4;
  page.drawRectangle({ x: 0, y: 0, width, height, color: PAPER });
  page.drawRectangle({ x: MARGIN, y: height - MARGIN - 5, width: width - MARGIN * 2, height: 5, color: ACCENT });
  page.drawText(`0${pageNumber}`, { x: MARGIN, y: 24, font: footerFont, size: 8, color: MUTED });
  page.drawText(dateLabel, { x: width - MARGIN - 62, y: 24, font: footerFont, size: 8, color: MUTED });
  return page;
}

function drawImageContain(page, image, box) {
  const ratio = image.width / image.height;
  let width = box.width;
  let height = width / ratio;
  if (height > box.height) { height = box.height; width = height * ratio; }
  page.drawImage(image, { x: box.x + (box.width - width) / 2, y: box.y + (box.height - height) / 2, width, height });
}

function drawFallbackArtwork(page, box, serifFont) {
  page.drawRectangle({ x: box.x, y: box.y, width: box.width, height: box.height, color: ACCENT });
  page.drawCircle({ x: box.x + box.width * 0.72, y: box.y + box.height * 0.7, size: Math.min(box.width, box.height) * 0.22, color: rgb(1, 1, 1), opacity: 0.92 });
  page.drawRectangle({ x: box.x + box.width * 0.17, y: box.y + box.height * 0.16, width: box.width * 0.38, height: box.height * 0.1, color: INK });
  drawVerticalText(page, "読むための余白", { font: serifFont, fontSize: 13, right: box.x + box.width * 0.22, top: box.y + box.height * 0.84, bottom: box.y + box.height * 0.32, left: box.x + 10, color: INK });
}

async function dataUrlToPngBytes(url) {
  const image = new Image();
  image.src = url;
  await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; });
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  canvas.getContext("2d").drawImage(image, 0, 0);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("image_conversion_failed");
  return new Uint8Array(await blob.arrayBuffer());
}

async function embedOptionalImage(pdf, url) {
  if (!url || typeof url !== "string" || !url.startsWith("data:image/")) return null;
  // The app always takes the browser/canvas path below. This branch keeps the
  // utility independently verifiable in a non-browser PDF test runner.
  if (typeof Image === "undefined") {
    const [header, encoded] = url.split(",", 2);
    if (!encoded) return null;
    const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
    return header.includes("image/jpeg") || header.includes("image/jpg") ? pdf.embedJpg(bytes) : pdf.embedPng(bytes);
  }
  try { return await pdf.embedPng(await dataUrlToPngBytes(url)); } catch { return null; }
}

async function loadFont(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error("font_load_failed");
  return new Uint8Array(await response.arrayBuffer());
}

export async function generateYomazinePdf(input) {
  const article = fallbackArticle(input.article);
  const savedMinutes = Math.max(0, Math.ceil(Number(input.durationSeconds || 0) / 60) - Number(input.readingMinutes || 0));

  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const [serifBytes, sansBytes] = await Promise.all([loadFont("/fonts/noto-serif-jp.ttf"), loadFont("/fonts/noto-sans-jp.ttf")]);
  const [serifFont, sansFont] = await Promise.all([
    pdf.embedFont(serifBytes, { subset: true }),
    pdf.embedFont(sansBytes, { subset: true }),
  ]);
  const [coverImage, articleImage] = await Promise.all([embedOptionalImage(pdf, input.illustrations?.cover), embedOptionalImage(pdf, input.illustrations?.article)]);
  const { iso, label: dateLabel } = dateParts();
  pdf.setTitle(article.magazineTitle);
  pdf.setAuthor("Yomazine");
  pdf.setSubject("YouTube動画を読むための雑誌");
  pdf.setCreator("Yomazine");
  pdf.setProducer("Yomazine");

  let contentFits = true;

  // 1. Cover
  let page = addPageBase(pdf, 1, dateLabel, serifFont);
  const coverBox = { x: 52, y: 92, width: 326, height: 612 };
  if (coverImage) drawImageContain(page, coverImage, coverBox); else drawFallbackArtwork(page, coverBox, serifFont);
  page.drawRectangle({ x: 390, y: 92, width: 153, height: 612, color: rgb(1, 1, 1), opacity: 0.94 });
  page.drawRectangle({ x: 390, y: 92, width: 9, height: 612, color: ACCENT });
  drawVerticalText(page, "Yomazine", { font: serifFont, fontSize: 10, right: 522, top: 672, bottom: 550, left: 500, color: ACCENT_DARK });
  contentFits = fitVerticalText(page, article.magazineTitle, { font: serifFont, right: 484, left: 414, top: 660, bottom: 205, maximum: 21, minimum: 9, columnGap: 8 }) && contentFits;
  drawVerticalText(page, "観る時間を、読む時間に。", { font: serifFont, fontSize: 9, right: 422, top: 650, bottom: 365, left: 404, color: MUTED });
  drawVerticalText(page, `発行日 ${dateLabel}`, { font: serifFont, fontSize: 8, right: 522, top: 194, bottom: 110, left: 500, color: MUTED });

  // 2. Contents and video details
  page = addPageBase(pdf, 2, dateLabel, serifFont);
  drawPageHeading(page, "目次", serifFont);
  drawPanel(page, { x: 279, y: 118, width: 179, height: 618 }, rgb(1, 1, 1));
  drawVerticalText(page, "この一冊の流れ", { font: serifFont, fontSize: 14, right: 435, top: 700, bottom: 470, left: 406, color: ACCENT_DARK });
  const tocItems = ["三頁　導入", "四頁　具体的なエピソード", "五頁　発見・実践・結び", "六頁　読書ログ・出典"];
  tocItems.forEach((item, index) => {
    const right = 391 - index * 29;
    const result = drawVerticalText(page, item, { font: serifFont, fontSize: 11.5, right, left: right - 18, top: 670, bottom: 190, maxColumns: 1 });
    contentFits = result.fits && contentFits;
  });
  drawPanel(page, { x: 52, y: 118, width: 205, height: 618 });
  drawVerticalText(page, "動画情報", { font: serifFont, fontSize: 15, right: 232, top: 700, bottom: 505, left: 200, color: ACCENT_DARK });
  const videoDetails = `${input.videoTitle}\n\nチャンネル\n${input.channelTitle}\n\n動画時間　${japaneseNumber(Math.ceil(input.durationSeconds / 60))}分\n読書時間　約${japaneseNumber(input.readingMinutes)}分`;
  contentFits = fitVerticalText(page, videoDetails, { font: serifFont, right: 187, left: 76, top: 692, bottom: 165, maximum: 11, minimum: 8, columnGap: 6 }) && contentFits;

  // 3. Introduction
  page = addPageBase(pdf, 3, dateLabel, serifFont);
  drawPageHeading(page, "導入", serifFont);
  drawVerticalText(page, "記事タイトル", { font: serifFont, fontSize: 8.5, right: 461, top: 710, bottom: 555, left: 443, color: ACCENT_DARK });
  contentFits = fitVerticalText(page, article.magazineTitle, { font: serifFont, right: 430, left: 367, top: 710, bottom: 150, maximum: 16, minimum: 9, columnGap: 7 }) && contentFits;
  drawPanel(page, { x: 52, y: 118, width: 288, height: 618 }, rgb(1, 1, 1));
  const introduction = `${article.lead}\n\n印象に残った場面\n${article.memorableMoment}`;
  contentFits = fitVerticalText(page, introduction, { font: serifFont, right: 316, left: 73, top: 700, bottom: 155, maximum: 12, minimum: 8, columnGap: 5 }) && contentFits;

  // 4. Episode and only an AI illustration (or PDF-drawn fallback).
  page = addPageBase(pdf, 4, dateLabel, serifFont);
  drawPageHeading(page, "具体的なエピソード", serifFont);
  drawPanel(page, { x: 52, y: 118, width: 180, height: 618 });
  const episodeBox = { x: 64, y: 410, width: 156, height: 294 };
  if (articleImage) drawImageContain(page, articleImage, episodeBox); else drawFallbackArtwork(page, episodeBox, serifFont);
  drawVerticalText(page, "場面のリズムを読む", { font: serifFont, fontSize: 13, right: 198, top: 368, bottom: 165, left: 170, color: ACCENT_DARK });
  page.drawCircle({ x: 91, y: 196, size: 24, color: ACCENT });
  page.drawCircle({ x: 128, y: 158, size: 9, color: rgb(1, 1, 1) });
  contentFits = fitVerticalText(page, article.episode, { font: serifFont, right: 454, left: 251, top: 710, bottom: 120, maximum: 12, minimum: 7, columnGap: 4 }) && contentFits;

  // 5. Discovery, practice, closing
  page = addPageBase(pdf, 5, dateLabel, serifFont);
  drawPageHeading(page, "発見・実践・結び", serifFont);
  drawPanel(page, { x: 52, y: 118, width: 406, height: 618 }, rgb(1, 1, 1));
  const pointNumbers = ["一", "二", "三", "四", "五", "六", "七", "八"];
  const practice = article.practicalPoints.map((point, index) => `${pointNumbers[index]}、${point}`).join("\n");
  const finalSection = `発見\n${article.discovery}\n\n実践ポイント\n${practice}\n\n結び\n${article.closing}`;
  contentFits = fitVerticalText(page, finalSection, { font: serifFont, right: 432, left: 74, top: 704, bottom: 150, maximum: 11.5, minimum: 7, columnGap: 4 }) && contentFits;

  // 6. Reading log and source
  page = addPageBase(pdf, 6, dateLabel, serifFont);
  drawPageHeading(page, "読書ログ・出典", serifFont);
  drawPanel(page, { x: 306, y: 118, width: 152, height: 618 }, rgb(1, 1, 1));
  drawVerticalText(page, "読書ログ", { font: serifFont, fontSize: 15, right: 432, top: 700, bottom: 520, left: 402, color: ACCENT_DARK });
  const log = `動画${japaneseNumber(Math.ceil(input.durationSeconds / 60))}分\n読書約${japaneseNumber(input.readingMinutes)}分${savedMinutes > 0 ? `\n${japaneseNumber(savedMinutes)}分短縮` : ""}`;
  contentFits = fitVerticalText(page, log, { font: serifFont, right: 386, left: 329, top: 690, bottom: 225, maximum: 13, minimum: 9, columnGap: 8 }) && contentFits;
  drawPanel(page, { x: 52, y: 118, width: 232, height: 618 });
  drawVerticalText(page, "出典情報", { font: serifFont, fontSize: 15, right: 259, top: 700, bottom: 520, left: 228, color: ACCENT_DARK });
  const source = `動画タイトル\n${input.videoTitle}\n\nチャンネル名\n${input.channelTitle}\n\n公開YouTube動画の情報を出典として利用しました。`;
  contentFits = fitVerticalText(page, source, { font: serifFont, right: 213, left: 100, top: 690, bottom: 245, maximum: 10, minimum: 7.5, columnGap: 5 }) && contentFits;
  drawVerticalText(page, "正規化URL", { font: serifFont, fontSize: 8, right: 80, top: 690, bottom: 575, left: 62, color: ACCENT_DARK });
  contentFits = drawRotatedLatinLine(page, input.normalizedUrl, { font: serifFont, fontSize: 8, x: 67, top: 560, maxLength: 365 }) && contentFits;

  if (!contentFits) {
    const error = new Error("article_too_long");
    error.code = "article_too_long";
    throw error;
  }

  const bytes = await pdf.save();
  return { bytes, filename: `yomazine-${iso}.pdf` };
}
