import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";

const A4 = [595.28, 841.89];
const MARGIN = 42;
const MIN_BODY_SIZE = 7;
const MAX_PAGES = 10;
const INK = rgb(0.09, 0.13, 0.07);
const MUTED = rgb(0.34, 0.38, 0.3);
const ACCENT = rgb(0.74, 0.94, 0.2);
const ACCENT_DARK = rgb(0.28, 0.39, 0.08);
const PANEL = rgb(0.95, 0.96, 0.91);
const PAPER = rgb(0.985, 0.985, 0.96);

// Add future magazine subheads here. Article fields are mapped directly to
// structured sections, so a word such as "発見" inside ordinary prose is never
// promoted to a heading by keyword replacement.
export const YOMAZINE_SECTION_HEADINGS = Object.freeze([
  { key: "memorableMoment", title: "印象に残った場面", group: "introduction" },
  { key: "discovery", title: "発見", group: "final" },
  { key: "practicalPoints", title: "実践ポイント", group: "final", list: true },
  { key: "closing", title: "結び", group: "final" },
]);

const SECTION_BEFORE_GAP_COLUMNS = 1;
const SECTION_AFTER_GAP_COLUMNS = 1;
const SECTION_MIN_BODY_COLUMNS = 1;

const verticalPunctuation = new Set(["、", "。", "，", "．", "：", "；", "！", "？"]);
const verticalJapanesePunctuation = new Map([
  ["、", "︑"],
  ["。", "︒"],
]);
const verticalLineCharacters = new Set(["ー", "ｰ", "―", "−", "‐", "–", "—"]);
const openingBrackets = new Set(["（", "［", "｛", "「", "『", "【", "〈", "《", "〔"]);
const closingBrackets = new Set(["）", "］", "｝", "」", "』", "】", "〉", "》", "〕"]);
const prohibitedAtColumnStart = new Set(["、", "。", ...closingBrackets]);
const verticalBracketGlyphs = new Map([
  ["「", { glyph: "﹁", role: "opening" }], ["」", { glyph: "﹂", role: "closing" }],
  ["『", { glyph: "﹃", role: "opening" }], ["』", { glyph: "﹄", role: "closing" }],
  ["（", { glyph: "︵", role: "opening" }], ["）", { glyph: "︶", role: "closing" }],
  ["［", { glyph: "﹇", role: "opening" }], ["］", { glyph: "﹈", role: "closing" }],
  ["｛", { glyph: "︷", role: "opening" }], ["｝", { glyph: "︸", role: "closing" }],
  ["【", { glyph: "︻", role: "opening" }], ["】", { glyph: "︼", role: "closing" }],
  ["〈", { glyph: "︿", role: "opening" }], ["〉", { glyph: "﹀", role: "closing" }],
  ["《", { glyph: "︽", role: "opening" }], ["》", { glyph: "︾", role: "closing" }],
  ["〔", { glyph: "︹", role: "opening" }], ["〕", { glyph: "︺", role: "closing" }],
]);
const kanjiDigits = new Map([
  ["0", "〇"], ["1", "一"], ["2", "二"], ["3", "三"], ["4", "四"],
  ["5", "五"], ["6", "六"], ["7", "七"], ["8", "八"], ["9", "九"],
]);

// Match the most meaningful ASCII groups first. This order is deliberate:
// an e-mail address must not become three words, and a time must not become
// two separate tate-chu-yoko numbers.
const verticalTokenPatterns = [
  { kind: "rotated", breakable: true, pattern: /^(?:https?:\/\/|www\.)[A-Za-z0-9~:/?#\[\]@!$&'()*+,;=%._-]+/ },
  { kind: "rotated", breakable: true, pattern: /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+/ },
  { kind: "rotated", pattern: /^\+?\d{1,4}(?:[-‐‑‒–—]\d{1,4}){2,}/ },
  { kind: "rotated", pattern: /^\d{4}[/.\-]\d{1,2}[/.\-]\d{1,2}/ },
  { kind: "rotated", pattern: /^\d{1,2}:\d{2}(?::\d{2})?/ },
  { kind: "rotated", breakable: true, pattern: /^(?=[A-Za-z0-9+_#./ -]*[A-Za-z])(?=[A-Za-z0-9+_#./ -]*\d)[A-Za-z0-9]+(?:[-_+/#.][A-Za-z0-9]+)*(?: +(?:\/ +)?[A-Za-z0-9]+(?:[-_+/#.][A-Za-z0-9]+)*)*/ },
  { kind: "latin", breakable: true, pattern: /^[A-Za-z]+(?:[ '-][A-Za-z]+)*(?:[.!?](?=$|[\s\u3000-\u30ff\u3400-\u9fff]))?/ },
  { kind: "number", pattern: /^[¥￥$€£]?\d[\d,]*(?:\.\d+)?(?:[%％℃°])?/ },
];

function cleanText(value) {
  return String(value || "").replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();
}

function drawHorizontalRun(page, value, options) {
  const { font, latinFont = font, size, x, y, color = INK } = options;
  let cursor = x;
  for (const character of value) {
    const characterFont = /^[\x20-\x7e]$/.test(character) ? latinFont : font;
    page.drawText(character, { x: cursor, y, font: characterFont, size, color });
    cursor += characterFont.widthOfTextAtSize(character, size);
  }
}

function drawClockwiseRun(page, value, options) {
  const { font, latinFont = font, size, x, y, color = INK } = options;
  let cursor = y;
  for (const character of value) {
    const characterFont = /^[\x20-\x7e]$/.test(character) ? latinFont : font;
    page.drawText(character, { x, y: cursor, font: characterFont, size, color, rotate: degrees(-90) });
    cursor -= characterFont.widthOfTextAtSize(character, size);
  }
}

function standardGlyphVerticalBounds(character, font, size) {
  const metrics = font.embedder?.font;
  const units = 1000;
  const ascender = Number(metrics?.Ascender) || 700;
  const descender = Number(metrics?.Descender) || -200;
  const capHeight = Number(metrics?.CapHeight) || ascender;
  const xHeight = Number(metrics?.XHeight) || capHeight * 0.7;
  let minimum = 0;
  let maximum = xHeight;

  if (/[A-Z0-9]/.test(character)) maximum = capHeight;
  else if (/[bdfhklt]/.test(character)) maximum = ascender;
  else if (/[()[\]{}\/\\|!?@#$%&*+=]/.test(character)) {
    minimum = descender;
    maximum = ascender;
  } else if (/[-~^]/.test(character)) maximum = xHeight * 0.65;
  else if (/[:;]/.test(character)) maximum = xHeight * 0.75;
  else if (/[.,]/.test(character)) maximum = xHeight * 0.2;

  if (/[gjpqy,;_]/.test(character)) minimum = descender;
  return { minimum: minimum * size / units, maximum: maximum * size / units };
}

function glyphVerticalBounds(character, characterFont, size) {
  const source = characterFont.embedder?.font;
  if (source?.glyphForCodePoint && source.unitsPerEm) {
    const box = source.glyphForCodePoint(character.codePointAt(0))?.bbox;
    if (box) {
      return {
        minimum: box.minY * size / source.unitsPerEm,
        maximum: box.maxY * size / source.unitsPerEm,
      };
    }
  }
  return standardGlyphVerticalBounds(character, characterFont, size);
}

function clockwiseRunInkBounds(value, font, latinFont, size) {
  let minimum = Number.POSITIVE_INFINITY;
  let maximum = Number.NEGATIVE_INFINITY;
  for (const character of value) {
    if (/\s/.test(character)) continue;
    const characterFont = /^[\x20-\x7e]$/.test(character) ? latinFont : font;
    const bounds = glyphVerticalBounds(character, characterFont, size);
    minimum = Math.min(minimum, bounds.minimum);
    maximum = Math.max(maximum, bounds.maximum);
  }
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum)) return { minimum: 0, maximum: size };
  return { minimum, maximum };
}

function centeredClockwiseRunX(value, lineCenter, font, latinFont, size) {
  const bounds = clockwiseRunInkBounds(value, font, latinFont, size);
  return lineCenter - (bounds.minimum + bounds.maximum) / 2;
}

function embeddedGlyphBounds(character, font, size) {
  const source = font.embedder?.font;
  const box = source?.glyphForCodePoint?.(character.codePointAt(0))?.bbox;
  if (!box || !source.unitsPerEm) return null;
  const scale = size / source.unitsPerEm;
  return {
    minimumX: box.minX * scale,
    maximumX: box.maxX * scale,
    minimumY: box.minY * scale,
    maximumY: box.maxY * scale,
  };
}

function verticalHalfMetrics(glyph, font, size, fallbackYOffset = 0) {
  const source = font.embedder?.font;
  const scale = source?.unitsPerEm ? size / source.unitsPerEm : 0;
  const position = source?.layout?.(glyph, ["vert", "vhal"])?.positions?.[0];
  const nativeAdvance = Math.abs(Number(position?.yAdvance) || 0) * scale;
  const nativeOffset = Number(position?.yOffset) * scale;
  return {
    advance: nativeAdvance || size * 0.5,
    yOffset: Number.isFinite(nativeOffset) ? nativeOffset : fallbackYOffset,
  };
}

function verticalBracketMetrics(character, font, size) {
  const vertical = verticalBracketGlyphs.get(character);
  return {
    ...vertical,
    ...verticalHalfMetrics(vertical.glyph, font, size, vertical.role === "opening" ? size * 0.5 : 0),
  };
}

function verticalJapanesePunctuationMetrics(character, font, size) {
  const glyph = verticalJapanesePunctuation.get(character);
  return { glyph, ...verticalHalfMetrics(glyph, font, size) };
}

function drawVerticalBracket(page, character, options) {
  const { font, fontSize, x, y, color } = options;
  const vertical = verticalBracketMetrics(character, font, fontSize);
  const bounds = embeddedGlyphBounds(vertical.glyph, font, fontSize);
  if (!bounds) {
    page.drawText(vertical.glyph, { x: x - fontSize / 2, y: y + vertical.yOffset, font, size: fontSize, color });
    return;
  }

  const originX = x - (bounds.minimumX + bounds.maximumX) / 2;
  // Use the font's vhal offset together with its half-em advance. Applying
  // only the offset moves whitespace from one side of the bracket to the
  // other; applying both keeps the ink and its logical body synchronized.
  page.drawText(vertical.glyph, { x: originX, y: y + vertical.yOffset, font, size: fontSize, color });
}

function drawVerticalGlyph(page, character, options) {
  const { font, fontSize, x, y, color = INK } = options;
  const isPunctuation = verticalPunctuation.has(character);
  const verticalPunctuationGlyph = verticalJapanesePunctuation.get(character);
  const verticalBracket = verticalBracketGlyphs.has(character);
  const isVerticalLine = verticalLineCharacters.has(character);

  if (verticalPunctuationGlyph) {
    const vertical = verticalJapanesePunctuationMetrics(character, font, fontSize);
    // Keep the upper-right vertical glyph position and its vhal half-em
    // advance as a pair; the bracket offsets intentionally do not apply here.
    page.drawText(vertical.glyph, {
      x: x - fontSize * 0.5,
      y: y + vertical.yOffset,
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
  } else if (verticalBracket) {
    drawVerticalBracket(page, character, { font, fontSize, x, y, color });
  } else {
    // CJK glyphs in the embedded font share a full-width em. Keeping the
    // column origin fixed is important: measuring a subset glyph separately
    // can introduce horizontal wobble in some PDF readers.
    page.drawText(character, { x: x - fontSize * 0.5 + (isPunctuation ? fontSize * 0.19 : 0), y: y + (isPunctuation ? fontSize * 0.15 : 0), font, size: fontSize, color });
  }
}

function verticalTokens(value, options = {}) {
  const { numericYearStyle = "original" } = options;
  const text = cleanText(value);
  const tokens = [];
  let cursor = 0;

  while (cursor < text.length) {
    const rest = text.slice(cursor);
    const character = rest[0];
    if (character === "\n") {
      tokens.push({ type: "break", value: character });
      cursor += 1;
      continue;
    }
    if (character === " ") {
      tokens.push({ type: "space", value: character });
      cursor += 1;
      continue;
    }

    if (numericYearStyle === "kanji") {
      const year = rest.match(/^\d{2,4}(?=年)/)?.[0];
      if (year) {
        for (const digit of year) tokens.push({ type: "glyph", value: kanjiDigits.get(digit) });
        cursor += year.length;
        continue;
      }
    }

    let matched = false;
    for (const { kind, pattern, breakable = false } of verticalTokenPatterns) {
      const value = rest.match(pattern)?.[0];
      if (!value) continue;
      if (kind === "number") {
        const digitCount = (value.match(/\d/g) || []).length;
        tokens.push({ type: digitCount <= 2 ? "tcy" : "rotated", value });
      } else if (kind === "latin") {
        tokens.push({ type: /^[A-Za-z]{2,3}$/.test(value) ? "short-latin" : "rotated", value, breakable });
      } else {
        tokens.push({ type: kind, value, breakable });
      }
      cursor += value.length;
      matched = true;
      break;
    }
    if (!matched) {
      tokens.push({ type: "glyph", value: character });
      cursor += character.length;
    }
  }
  return tokens;
}

function isTateChuYoko(token, font, fontSize, latinFont = font) {
  if (token.type === "tcy") return true;
  if (token.type !== "short-latin") return false;
  return mixedTextWidth(token.value, font, latinFont, fontSize * 0.78) <= fontSize * 0.94;
}

function splitBreakableRotatedToken(token, font, latinFont, fontSize, maxTextLength) {
  if (!token.breakable || mixedTextWidth(token.value, font, latinFont, fontSize * 0.78) <= maxTextLength) return [token];
  const chunks = [];
  let remaining = token.value;
  while (mixedTextWidth(remaining, font, latinFont, fontSize * 0.78) > maxTextLength) {
    let breakAt = -1;
    for (let index = 1; index <= remaining.length; index += 1) {
      const candidate = remaining.slice(0, index);
      if (mixedTextWidth(candidate, font, latinFont, fontSize * 0.78) > maxTextLength) break;
      if (/[\s/.\-]/.test(remaining[index - 1])) breakAt = index;
    }
    if (breakAt <= 0) return [token];
    chunks.push({ ...token, type: "rotated", value: remaining.slice(0, breakAt).trimEnd() });
    remaining = remaining.slice(breakAt).trimStart();
  }
  if (remaining) chunks.push({ ...token, type: "rotated", value: remaining });
  return chunks;
}

function preparedVerticalTokens(value, font, latinFont, fontSize, columnHeight, typography) {
  const maxTextLength = Math.max(fontSize, columnHeight - fontSize * 0.18);
  return verticalTokens(value, typography).flatMap((token) => (
    token.type === "rotated" ? splitBreakableRotatedToken(token, font, latinFont, fontSize, maxTextLength) : [token]
  ));
}

function tokenAdvance(token, font, fontSize, latinFont = font) {
  const lineAdvance = fontSize * 1.18;
  const interTokenTracking = lineAdvance - fontSize;
  if (token.type === "break") return lineAdvance * 1.5;
  if (token.type === "space") return lineAdvance * 0.55;
  if (token.type === "glyph" && verticalJapanesePunctuation.has(token.value)) {
    return verticalJapanesePunctuationMetrics(token.value, font, fontSize).advance + interTokenTracking;
  }
  if (token.type === "glyph" && verticalBracketGlyphs.has(token.value)) {
    return verticalBracketMetrics(token.value, font, fontSize).advance + interTokenTracking;
  }
  if (isTateChuYoko(token, font, fontSize, latinFont)) return lineAdvance;
  if (token.type === "rotated" || token.type === "short-latin") {
    // A rotated run extends downward by its measured horizontal text width.
    // Follow it with the same 0.18-em tracking used between ordinary Japanese
    // cells; adding a complete cell here creates a visible one-character gap.
    return mixedTextWidth(token.value, font, latinFont, fontSize * 0.78) + interTokenTracking;
  }
  return lineAdvance;
}

function shouldWrapBeforeToken(tokens, index, remaining, columnHeight, font, fontSize, latinFont = font) {
  const token = tokens[index];
  const advance = tokenAdvance(token, font, fontSize, latinFont);
  const isProhibitedAtStart = token.type === "glyph" && prohibitedAtColumnStart.has(token.value);
  if (!isProhibitedAtStart && advance > remaining && remaining < columnHeight) return true;

  // Keep an opening bracket, any nested opening brackets, and their first
  // content token together so an opening mark cannot end a column by itself.
  if (token.type === "glyph" && openingBrackets.has(token.value)) {
    let groupAdvance = advance;
    let nextIndex = index + 1;
    while (tokens[nextIndex]?.type === "glyph" && openingBrackets.has(tokens[nextIndex].value)) {
      groupAdvance += tokenAdvance(tokens[nextIndex], font, fontSize, latinFont);
      nextIndex += 1;
    }
    if (tokens[nextIndex] && tokens[nextIndex].type !== "break" && tokens[nextIndex].type !== "space") {
      groupAdvance += tokenAdvance(tokens[nextIndex], font, fontSize, latinFont);
    }
    if (groupAdvance > remaining && groupAdvance <= columnHeight && remaining < columnHeight) return true;
  }

  // Closing brackets and Japanese punctuation must stay with the preceding
  // token instead of being pushed to the top of the next column.
  if (token.type !== "break" && token.type !== "space" && !isProhibitedAtStart) {
    let groupAdvance = advance;
    let nextIndex = index + 1;
    while (tokens[nextIndex]?.type === "glyph" && prohibitedAtColumnStart.has(tokens[nextIndex].value)) {
      groupAdvance += tokenAdvance(tokens[nextIndex], font, fontSize, latinFont);
      nextIndex += 1;
    }
    if (groupAdvance > remaining && groupAdvance <= columnHeight && remaining < columnHeight) return true;
  }

  return false;
}

function verticalColumnCount(text, font, fontSize, height, typography) {
  const columns = verticalTokenColumns(text, font, fontSize, height, typography);
  return columns ? columns.length : Number.POSITIVE_INFINITY;
}

function verticalTokenColumns(text, font, fontSize, height, typography) {
  const columnHeight = Math.max(fontSize, height);
  const latinFont = typography?.latinFont || font;
  const tokens = preparedVerticalTokens(text, font, latinFont, fontSize, columnHeight, typography);
  const columns = [[]];
  let remaining = columnHeight;
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const advance = tokenAdvance(token, font, fontSize, latinFont);
    if (shouldWrapBeforeToken(tokens, index, remaining, columnHeight, font, fontSize, latinFont)) {
      columns.push([]);
      remaining = columnHeight;
    }
    if (advance > columnHeight) return null;
    columns.at(-1).push(token);
    remaining -= advance;
  }
  return columns;
}

function splitVerticalText(value, font, fontSize, height, firstPageColumns, continuationColumns, typography) {
  const columns = verticalTokenColumns(value, font, fontSize, height, typography);
  if (!columns) return null;

  const pageCount = columns.length <= firstPageColumns
    ? 1
    : 1 + Math.ceil((columns.length - firstPageColumns) / continuationColumns);
  const chunks = [];
  let start = 0;
  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    const pagesLeft = pageCount - pageIndex;
    const columnsLeft = columns.length - start;
    const pageCapacity = pageIndex === 0 ? firstPageColumns : continuationColumns;
    const minimumHere = Math.max(1, columnsLeft - (pagesLeft - 1) * continuationColumns);
    const balancedCount = Math.ceil(columnsLeft / pagesLeft);
    const columnCount = Math.max(minimumHere, Math.min(pageCapacity, balancedCount));
    const tokens = columns.slice(start, start + columnCount).flat();
    chunks.push(tokens.map((token) => token.value).join(""));
    start += columnCount;
  }
  return chunks;
}

export function createArticleSections(article) {
  const pointNumbers = ["一", "二", "三", "四", "五", "六", "七", "八"];
  return YOMAZINE_SECTION_HEADINGS.map((definition) => {
    const value = article[definition.key];
    const body = definition.list
      ? value.map((point, index) => `${pointNumbers[index] || index + 1}、${point}`).join("\n")
      : value;
    return { key: definition.key, title: definition.title, body, group: definition.group };
  });
}

function planSectionPages(sections, font, fontSize, height, pageCapacities, typography) {
  const pages = [];
  const headingFontSize = fontSize + 2;
  let pageIndex = -1;
  let usedColumns = 0;

  const capacityForPage = (index) => pageCapacities[Math.min(index, pageCapacities.length - 1)];
  const startPage = () => {
    pageIndex += 1;
    usedColumns = 0;
    pages.push({ capacity: capacityForPage(pageIndex), placements: [] });
  };
  const currentPage = () => pages[pageIndex];

  startPage();
  for (const section of sections) {
    const bodyColumns = verticalTokenColumns(section.body, font, fontSize, height, typography);
    const headingColumns = section.title
      ? verticalColumnCount(section.title, font, headingFontSize, height, typography)
      : 0;
    if (!bodyColumns || headingColumns > 1) return null;

    if (section.title) {
      const requiredColumns = SECTION_BEFORE_GAP_COLUMNS + 1 + SECTION_AFTER_GAP_COLUMNS + SECTION_MIN_BODY_COLUMNS;
      if (currentPage().capacity - usedColumns < requiredColumns) startPage();
      usedColumns += SECTION_BEFORE_GAP_COLUMNS;
      currentPage().placements.push({ type: "heading", title: section.title, startColumn: usedColumns, columnCount: 1 });
      usedColumns += 1 + SECTION_AFTER_GAP_COLUMNS;
    }

    let bodyStart = 0;
    while (bodyStart < bodyColumns.length) {
      if (usedColumns >= currentPage().capacity) startPage();
      const columnCount = Math.min(currentPage().capacity - usedColumns, bodyColumns.length - bodyStart);
      const text = bodyColumns
        .slice(bodyStart, bodyStart + columnCount)
        .flat()
        .map((token) => token.value)
        .join("");
      currentPage().placements.push({ type: "body", text, startColumn: usedColumns, columnCount });
      usedColumns += columnCount;
      bodyStart += columnCount;
    }
  }
  return pages;
}

function planArticlePages(article, font, typography) {
  const textHeight = 550;
  const configuredSections = createArticleSections(article);
  const introductionSections = [
    { key: "lead", title: null, body: article.lead, group: "introduction" },
    ...configuredSections.filter((section) => section.group === "introduction"),
  ];
  const finalSections = configuredSections.filter((section) => section.group === "final");

  for (const fontSize of [11.5, 11, 10.5, 10, 9.5, 9, 8.5, 8]) {
    const fullPageColumns = Math.floor((432 - 74) / (fontSize + 4));
    const introductionPages = planSectionPages(
      introductionSections,
      font,
      fontSize,
      textHeight,
      [Math.floor((316 - 73) / (fontSize + 4)), fullPageColumns],
      typography,
    );
    const episodeChunks = splitVerticalText(
      article.episode,
      font,
      fontSize,
      textHeight,
      Math.floor((454 - 251) / (fontSize + 4)),
      fullPageColumns,
      typography,
    );
    const finalPages = planSectionPages(finalSections, font, fontSize, textHeight, [fullPageColumns], typography);
    if (!introductionPages || !episodeChunks || !finalPages) continue;

    const pageCount = 3 + introductionPages.length + episodeChunks.length + finalPages.length;
    if (pageCount <= MAX_PAGES) {
      return { fontSize, introductionPages, episodeChunks, finalPages, pageCount };
    }
  }

  return null;
}

function drawSectionPlacements(page, pagePlan, options) {
  const { font, latinFont = font, fontSize, right, top, bottom, columnGap = 4, numericYearStyle = "original" } = options;
  const columnAdvance = fontSize + columnGap;
  let fits = true;

  for (const placement of pagePlan.placements) {
    if (placement.type === "heading") {
      const headingSize = fontSize + 2;
      const center = right - (placement.startColumn + 0.5) * columnAdvance;
      page.drawRectangle({
        x: center + headingSize * 0.63,
        y: top - 54,
        width: 2.5,
        height: 54,
        color: ACCENT,
      });
      const result = drawVerticalText(page, placement.title, {
        font,
        latinFont,
        fontSize: headingSize,
        right: center + headingSize / 2,
        left: center - headingSize / 2,
        top,
        bottom,
        maxColumns: 1,
        columnGap: 0,
        color: ACCENT_DARK,
        numericYearStyle,
      });
      fits = result.fits && result.columns === 1 && fits;
      continue;
    }

    const placementRight = right - placement.startColumn * columnAdvance;
    const result = drawVerticalText(page, placement.text, {
      font,
      latinFont,
      fontSize,
      right: placementRight,
      left: placementRight - placement.columnCount * columnAdvance,
      top,
      bottom,
      maxColumns: placement.columnCount,
      columnGap,
      numericYearStyle,
    });
    fits = result.fits && fits;
  }
  return fits;
}

/**
 * Draws Japanese vertical type one glyph at a time. Columns begin at `right`
 * and move left, which avoids relying on a horizontal text rotation shortcut.
 */
export function drawVerticalText(page, value, options) {
  const text = cleanText(value);
  const { font, latinFont = font, fontSize, right, top, bottom, left = MARGIN, columnGap = 3, color = INK, maxColumns, numericYearStyle = "original" } = options;
  const typography = { numericYearStyle, latinFont };
  const lineAdvance = fontSize * 1.18;
  const columnAdvance = fontSize + columnGap;
  const usableHeight = top - bottom;
  const tokens = preparedVerticalTokens(text, font, latinFont, fontSize, usableHeight, typography);
  const availableColumns = maxColumns || Math.floor((right - left) / columnAdvance);
  const neededColumns = verticalColumnCount(text, font, fontSize, usableHeight, typography);
  if (neededColumns > availableColumns) return { fits: false, neededColumns, availableColumns };

  let x = right - fontSize / 2;
  // `y` is the top edge of the next logical token box. Japanese glyphs use a
  // baseline one em below it, while rotated runs start at the edge itself.
  // Keeping this shared top-edge coordinate prevents baseline-vs-ink-box
  // differences from turning into a phantom cell around Latin text.
  let y = top;
  let columns = 1;
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const advance = tokenAdvance(token, font, fontSize, latinFont);
    const remaining = y - bottom;
    if (shouldWrapBeforeToken(tokens, index, remaining, usableHeight, font, fontSize, latinFont)) {
      x -= columnAdvance;
      y = top;
      columns += 1;
    }
    if (token.type === "glyph") {
      drawVerticalGlyph(page, token.value, { font, fontSize, x, y: y - fontSize, color });
    } else if (isTateChuYoko(token, font, fontSize, latinFont)) {
      const tcySize = fontSize * 0.78;
      const width = latinFont.widthOfTextAtSize(token.value, tcySize);
      drawHorizontalRun(page, token.value, { x: x - width / 2, y: y - fontSize + fontSize * 0.08, font, latinFont, size: tcySize, color });
    } else if (token.type === "rotated" || token.type === "short-latin") {
      // Keep every Latin/number run in the same horizontal writing direction,
      // rotated clockwise as one block inside the vertical column. The token
      // advance reserves its measured length plus ordinary Japanese tracking.
      const runSize = fontSize * 0.78;
      const runX = centeredClockwiseRunX(token.value, x, font, latinFont, runSize);
      drawClockwiseRun(page, token.value, {
        x: runX,
        y,
        font,
        latinFont,
        size: runSize,
        color,
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

function sizeForText(text, width, height, maximum, minimum, font, columnGap = 3, typography) {
  for (let size = maximum; size >= minimum; size -= 0.5) {
    if (verticalColumnCount(text, font, size, height, typography) * (size + columnGap) <= width) return size;
  }
  return null;
}

function fitVerticalText(page, text, options) {
  const { font, latinFont = font, right, left, top, bottom, maximum = 12, minimum = MIN_BODY_SIZE, columnGap = 4, numericYearStyle = "original" } = options;
  const fontSize = sizeForText(text, right - left, top - bottom, maximum, minimum, font, columnGap, { numericYearStyle, latinFont });
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
  const { font, latinFont = font, fontSize, x, top, maxLength, color = MUTED } = options;
  const value = cleanText(text);
  let fittedSize = fontSize;
  while (fittedSize > 5 && latinFont.widthOfTextAtSize(value, fittedSize) > maxLength) fittedSize -= 0.5;
  if (latinFont.widthOfTextAtSize(value, fittedSize) > maxLength) return false;
  drawClockwiseRun(page, value, { x: centeredClockwiseRunX(value, x, font, latinFont, fittedSize), y: top, font, latinFont, size: fittedSize, color });
  return true;
}

function addPageBase(pdf, pageNumber, dateLabel, footerFont) {
  const page = pdf.addPage(A4);
  const [width, height] = A4;
  page.drawRectangle({ x: 0, y: 0, width, height, color: PAPER });
  page.drawRectangle({ x: MARGIN, y: height - MARGIN - 5, width: width - MARGIN * 2, height: 5, color: ACCENT });
  page.drawText(String(pageNumber).padStart(2, "0"), { x: MARGIN, y: 24, font: footerFont, size: 8, color: MUTED });
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

function mixedTextWidth(value, font, latinFont, fontSize) {
  return Array.from(value).reduce((width, character) => {
    const characterFont = /^[\x20-\x7e]$/.test(character) ? latinFont : font;
    return width + characterFont.widthOfTextAtSize(character, fontSize);
  }, 0);
}

export async function generateYomazinePdf(input) {
  const article = fallbackArticle(input.article);
  const savedMinutes = Math.max(0, Math.ceil(Number(input.durationSeconds || 0) / 60) - Number(input.readingMinutes || 0));
  const numericYearStyle = input.pdfOptions?.numericYearStyle === "kanji" ? "kanji" : "original";

  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const serifBytes = await loadFont("/fonts/noto-serif-jp.ttf");
  const [serifFont, latinFont] = await Promise.all([
    pdf.embedFont(serifBytes, { subset: false }),
    pdf.embedFont(StandardFonts.TimesRoman),
  ]);
  const typography = { numericYearStyle, latinFont };
  const [coverImage, articleImage] = await Promise.all([embedOptionalImage(pdf, input.illustrations?.cover), embedOptionalImage(pdf, input.illustrations?.article)]);
  const articlePlan = planArticlePages(article, serifFont, typography);
  if (!articlePlan) {
    const error = new Error("article_too_long");
    error.code = "article_too_long";
    throw error;
  }
  const { iso, label: dateLabel } = dateParts();
  pdf.setTitle(article.magazineTitle);
  pdf.setAuthor("Yomazine");
  pdf.setSubject("YouTube動画を読むための雑誌");
  pdf.setCreator("Yomazine");
  pdf.setProducer("Yomazine");

  let contentFits = true;
  const drawVertical = (targetPage, text, options) => drawVerticalText(targetPage, text, { ...typography, ...options });
  const fitVertical = (targetPage, text, options) => fitVerticalText(targetPage, text, { ...typography, ...options });

  // 1. Cover
  let page = addPageBase(pdf, 1, dateLabel, latinFont);
  const coverBox = { x: 52, y: 92, width: 326, height: 612 };
  if (coverImage) drawImageContain(page, coverImage, coverBox); else drawFallbackArtwork(page, coverBox, serifFont);
  page.drawRectangle({ x: 390, y: 92, width: 153, height: 612, color: rgb(1, 1, 1), opacity: 0.94 });
  page.drawRectangle({ x: 390, y: 92, width: 9, height: 612, color: ACCENT });
  drawVertical(page, "Yomazine", { font: serifFont, fontSize: 10, right: 522, top: 672, bottom: 550, left: 500, color: ACCENT_DARK });
  contentFits = fitVertical(page, article.magazineTitle, { font: serifFont, right: 484, left: 414, top: 660, bottom: 205, maximum: 21, minimum: 9, columnGap: 8 }) && contentFits;
  drawVertical(page, "観る時間を、読む時間に。", { font: serifFont, fontSize: 9, right: 422, top: 650, bottom: 365, left: 404, color: MUTED });
  drawVertical(page, `発行日 ${dateLabel}`, { font: serifFont, fontSize: 8, right: 522, top: 194, bottom: 110, left: 500, color: MUTED });

  // 2. Contents and video details
  page = addPageBase(pdf, 2, dateLabel, latinFont);
  drawPageHeading(page, "目次", serifFont);
  drawPanel(page, { x: 279, y: 118, width: 179, height: 618 }, rgb(1, 1, 1));
  drawVerticalText(page, "この一冊の流れ", { font: serifFont, fontSize: 14, right: 435, top: 700, bottom: 470, left: 406, color: ACCENT_DARK });
  const introductionPage = 3;
  const episodePage = introductionPage + articlePlan.introductionPages.length;
  const finalSectionPage = episodePage + articlePlan.episodeChunks.length;
  const sourcePage = articlePlan.pageCount;
  const tocItems = [
    `${japaneseNumber(introductionPage)}頁　導入`,
    `${japaneseNumber(episodePage)}頁　具体的なエピソード`,
    `${japaneseNumber(finalSectionPage)}頁　発見・実践・結び`,
    `${japaneseNumber(sourcePage)}頁　読書ログ・出典`,
  ];
  tocItems.forEach((item, index) => {
    const right = 391 - index * 29;
    const result = drawVertical(page, item, { font: serifFont, fontSize: 11.5, right, left: right - 18, top: 670, bottom: 190, maxColumns: 1 });
    contentFits = result.fits && contentFits;
  });
  drawPanel(page, { x: 52, y: 118, width: 205, height: 618 });
  drawVerticalText(page, "動画情報", { font: serifFont, fontSize: 15, right: 232, top: 700, bottom: 505, left: 200, color: ACCENT_DARK });
  const videoDetails = `${input.videoTitle}\n\nチャンネル\n${input.channelTitle}\n\n動画時間　${japaneseNumber(Math.ceil(input.durationSeconds / 60))}分\n読書時間　約${japaneseNumber(input.readingMinutes)}分`;
  contentFits = fitVertical(page, videoDetails, { font: serifFont, right: 187, left: 76, top: 692, bottom: 165, maximum: 11, minimum: 8, columnGap: 6 }) && contentFits;

  let pageNumber = 3;
  articlePlan.introductionPages.forEach((sectionPage, index) => {
    page = addPageBase(pdf, pageNumber, dateLabel, latinFont);
    drawPageHeading(page, index === 0 ? "導入" : "導入・続き", serifFont);
    if (index === 0) {
      drawVertical(page, "記事タイトル", { font: serifFont, fontSize: 8.5, right: 461, top: 710, bottom: 555, left: 443, color: ACCENT_DARK });
      contentFits = fitVertical(page, article.magazineTitle, { font: serifFont, right: 430, left: 367, top: 710, bottom: 150, maximum: 16, minimum: 9, columnGap: 7 }) && contentFits;
      drawPanel(page, { x: 52, y: 118, width: 288, height: 618 }, rgb(1, 1, 1));
      contentFits = drawSectionPlacements(page, sectionPage, { ...typography, font: serifFont, fontSize: articlePlan.fontSize, right: 316, top: 700, bottom: 150, columnGap: 4 }) && contentFits;
    } else {
      drawPanel(page, { x: 52, y: 118, width: 406, height: 618 }, rgb(1, 1, 1));
      contentFits = drawSectionPlacements(page, sectionPage, { ...typography, font: serifFont, fontSize: articlePlan.fontSize, right: 432, top: 700, bottom: 150, columnGap: 4 }) && contentFits;
    }
    pageNumber += 1;
  });

  articlePlan.episodeChunks.forEach((chunk, index) => {
    page = addPageBase(pdf, pageNumber, dateLabel, latinFont);
    drawPageHeading(page, index === 0 ? "具体的なエピソード" : "具体的なエピソード・続き", serifFont);
    if (index === 0) {
      drawPanel(page, { x: 52, y: 118, width: 180, height: 618 });
      const episodeBox = { x: 64, y: 410, width: 156, height: 294 };
      if (articleImage) drawImageContain(page, articleImage, episodeBox); else drawFallbackArtwork(page, episodeBox, serifFont);
      drawVerticalText(page, "場面のリズムを読む", { font: serifFont, fontSize: 13, right: 198, top: 368, bottom: 165, left: 170, color: ACCENT_DARK });
      page.drawCircle({ x: 91, y: 196, size: 24, color: ACCENT });
      page.drawCircle({ x: 128, y: 158, size: 9, color: rgb(1, 1, 1) });
      contentFits = drawVertical(page, chunk, { font: serifFont, fontSize: articlePlan.fontSize, right: 454, left: 251, top: 700, bottom: 150, columnGap: 4 }).fits && contentFits;
    } else {
      drawPanel(page, { x: 52, y: 118, width: 406, height: 618 }, rgb(1, 1, 1));
      contentFits = drawVertical(page, chunk, { font: serifFont, fontSize: articlePlan.fontSize, right: 432, left: 74, top: 700, bottom: 150, columnGap: 4 }).fits && contentFits;
    }
    pageNumber += 1;
  });

  articlePlan.finalPages.forEach((sectionPage, index) => {
    page = addPageBase(pdf, pageNumber, dateLabel, latinFont);
    drawPageHeading(page, index === 0 ? "発見・実践・結び" : "発見・実践・結び・続き", serifFont);
    drawPanel(page, { x: 52, y: 118, width: 406, height: 618 }, rgb(1, 1, 1));
    contentFits = drawSectionPlacements(page, sectionPage, { ...typography, font: serifFont, fontSize: articlePlan.fontSize, right: 432, top: 700, bottom: 150, columnGap: 4 }) && contentFits;
    pageNumber += 1;
  });

  // Final page: reading log and source
  page = addPageBase(pdf, pageNumber, dateLabel, latinFont);
  drawPageHeading(page, "読書ログ・出典", serifFont);
  drawPanel(page, { x: 306, y: 118, width: 152, height: 618 }, rgb(1, 1, 1));
  drawVerticalText(page, "読書ログ", { font: serifFont, fontSize: 15, right: 432, top: 700, bottom: 520, left: 402, color: ACCENT_DARK });
  const log = `動画${japaneseNumber(Math.ceil(input.durationSeconds / 60))}分\n読書約${japaneseNumber(input.readingMinutes)}分${savedMinutes > 0 ? `\n${japaneseNumber(savedMinutes)}分短縮` : ""}`;
  contentFits = fitVertical(page, log, { font: serifFont, right: 386, left: 329, top: 690, bottom: 225, maximum: 13, minimum: 9, columnGap: 8 }) && contentFits;
  drawPanel(page, { x: 52, y: 118, width: 232, height: 618 });
  drawVerticalText(page, "出典情報", { font: serifFont, fontSize: 15, right: 259, top: 700, bottom: 520, left: 228, color: ACCENT_DARK });
  const source = `動画タイトル\n${input.videoTitle}\n\nチャンネル名\n${input.channelTitle}\n\n公開YouTube動画の情報を出典として利用しました。`;
  contentFits = fitVertical(page, source, { font: serifFont, right: 213, left: 100, top: 690, bottom: 245, maximum: 10, minimum: 7.5, columnGap: 5 }) && contentFits;
  drawVerticalText(page, "正規化URL", { font: serifFont, fontSize: 8, right: 80, top: 690, bottom: 575, left: 62, color: ACCENT_DARK });
  contentFits = drawRotatedLatinLine(page, input.normalizedUrl, { font: serifFont, latinFont, fontSize: 8, x: 67, top: 560, maxLength: 365 }) && contentFits;

  if (!contentFits || pageNumber !== articlePlan.pageCount) {
    const error = new Error("article_too_long");
    error.code = "article_too_long";
    throw error;
  }

  const bytes = await pdf.save();
  return { bytes, filename: `yomazine-${iso}.pdf` };
}
