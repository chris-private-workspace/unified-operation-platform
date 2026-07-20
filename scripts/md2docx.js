#!/usr/bin/env node
/**
 * md2docx.js — Markdown → professional .docx converter (docx-js).
 *
 * Built for Unified Operation Platform documents:
 *   - A4, cover page, auto TOC
 *   - CJK-aware fonts (Arial ascii + Microsoft JhengHei eastAsia)
 *   - GFM tables with shaded header + auto column widths
 *   - Blockquote callouts, fenced code blocks, bullet/ordered lists
 *   - Inline **bold**, `code`, [text](url)
 *
 * Usage: node md2docx.js <input.md> <output.docx> [--title "..."] [--subtitle "..."]
 */
const fs = require('fs');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, LevelFormat, ExternalHyperlink,
  TableOfContents, HeadingLevel, BorderStyle, WidthType, ShadingType,
  VerticalAlign, PageNumber, PageBreak, TabStopType, TabStopPosition,
} = require('docx');

// ── layout constants (A4) ────────────────────────────────────────────
const PAGE_W = 11906, PAGE_H = 16838;
const MARGIN = 1080;                       // 0.75"
const CONTENT_W = PAGE_W - MARGIN * 2;     // 9746
const ACCENT = 'E60027';                   // Ricoh red
const INK = '111827', MUTED = '6B7280', RULE = 'D1D5DB', ZEBRA = 'F7F8FA', HEADFILL = 'EEF1F4';

const FONT = { ascii: 'Arial', hAnsi: 'Arial', eastAsia: 'Microsoft JhengHei' };
const MONO = { ascii: 'Consolas', hAnsi: 'Consolas', eastAsia: 'Microsoft JhengHei' };

// ── CLI ──────────────────────────────────────────────────────────────
const [, , inPath, outPath, ...rest] = process.argv;
if (!inPath || !outPath) { console.error('usage: md2docx.js <in.md> <out.docx>'); process.exit(1); }
const argOf = (flag) => { const i = rest.indexOf(flag); return i >= 0 ? rest[i + 1] : null; };
const COVER_TITLE = argOf('--title');
const COVER_SUB = argOf('--subtitle');
const COVER_META = argOf('--meta');

const src = fs.readFileSync(inPath, 'utf8').replace(/\r\n/g, '\n');

// ── inline parser: **bold**, `code`, [text](url) ─────────────────────
function inlineRuns(text, base = {}) {
  const runs = [];
  // split on links first
  const linkRe = /\[([^\]]+)\]\(([^)]+)\)/g;
  let last = 0, m;
  const pushPlain = (s) => { if (s) runs.push(...styledRuns(s, base)); };
  while ((m = linkRe.exec(text)) !== null) {
    pushPlain(text.slice(last, m.index));
    runs.push(new ExternalHyperlink({
      link: m[2],
      children: styledRuns(m[1], { ...base, color: '1D4ED8', underline: {} }),
    }));
    last = linkRe.lastIndex;
  }
  pushPlain(text.slice(last));
  return runs.length ? runs : [new TextRun({ text: '', font: FONT })];
}

// handles ** ** and ` ` within a plain segment
function styledRuns(text, base) {
  const out = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0, m;
  const emit = (t, extra) => {
    if (!t) return;
    out.push(new TextRun({
      text: t,
      font: extra && extra.mono ? MONO : FONT,
      size: base.size || 20,
      bold: base.bold || (extra && extra.bold) || false,
      color: (extra && extra.mono ? 'A21B2B' : base.color) || INK,
      underline: base.underline,
      italics: base.italics || false,
    }));
  };
  while ((m = re.exec(text)) !== null) {
    emit(text.slice(last, m.index));
    const tok = m[1];
    if (tok.startsWith('**')) emit(tok.slice(2, -2), { bold: true });
    else emit(tok.slice(1, -1), { mono: true });
    last = re.lastIndex;
  }
  emit(text.slice(last));
  return out;
}

// ── block helpers ────────────────────────────────────────────────────
const rule = (color = RULE, size = 6) => ({
  bottom: { style: BorderStyle.SINGLE, size, color, space: 6 },
});

function para(text, opts = {}) {
  return new Paragraph({
    children: inlineRuns(text, { size: opts.size, bold: opts.bold, color: opts.color }),
    spacing: opts.spacing || { before: 60, after: 120, line: 276 },
    alignment: opts.alignment,
    border: opts.border,
    shading: opts.shading,
    indent: opts.indent,
    numbering: opts.numbering,
    heading: opts.heading,
    pageBreakBefore: opts.pageBreakBefore,
  });
}

function calloutParas(lines) {
  // one shaded block; each line its own paragraph, borders on first/last
  return lines.map((ln, i) => new Paragraph({
    children: inlineRuns(ln, { size: 19, color: '374151' }),
    spacing: { before: i === 0 ? 120 : 20, after: i === lines.length - 1 ? 160 : 20, line: 264 },
    indent: { left: 260 },
    shading: { fill: 'F5F6F8', type: ShadingType.CLEAR },
    // Left accent bar only. docx-js 9.7.1 emits w:pBdr children as top/bottom/left/right,
    // but the OOXML schema demands top/left/bottom/right — so mixing `bottom` with `left`
    // produces a schema-invalid file. Shading already delimits the block.
    border: { left: { style: BorderStyle.SINGLE, size: 18, color: ACCENT, space: 8 } },
  }));
}

function codeParas(lines) {
  return lines.map((ln, i) => new Paragraph({
    children: [new TextRun({ text: ln || ' ', font: MONO, size: 17, color: '1F2937' })],
    spacing: { before: i === 0 ? 100 : 0, after: i === lines.length - 1 ? 140 : 0, line: 240 },
    indent: { left: 220 },
    shading: { fill: 'F3F4F6', type: ShadingType.CLEAR },
  }));
}

// ── table builder ────────────────────────────────────────────────────
function splitRow(line) {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  const cells = []; let cur = '';
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\' && s[i + 1] === '|') { cur += '|'; i++; continue; }
    if (s[i] === '|') { cells.push(cur.trim()); cur = ''; continue; }
    cur += s[i];
  }
  cells.push(cur.trim());
  return cells;
}

const visualLen = (s) => {
  // CJK chars count double
  let n = 0;
  for (const ch of s.replace(/\*\*|`/g, '')) n += /[　-鿿＀-￯]/.test(ch) ? 2 : 1;
  return n;
};

function buildTable(rows) {
  const header = rows[0];
  const body = rows.slice(1);
  const nCols = header.length;

  // weight columns by max visual content length (clamped)
  const weights = header.map((_, c) => {
    let max = visualLen(header[c] || '');
    for (const r of body) max = Math.max(max, visualLen(r[c] || ''));
    return Math.min(Math.max(max, 4), 60);
  });
  const sum = weights.reduce((a, b) => a + b, 0);
  let widths = weights.map((w) => Math.max(700, Math.round((w / sum) * CONTENT_W)));
  // normalise to exactly CONTENT_W
  let diff = CONTENT_W - widths.reduce((a, b) => a + b, 0);
  const widest = widths.indexOf(Math.max(...widths));
  widths[widest] += diff;

  const cellBorder = { style: BorderStyle.SINGLE, size: 1, color: RULE };
  // OOXML requires w:tcBdr children in order: top, left, bottom, right
  const borders = { top: cellBorder, left: cellBorder, bottom: cellBorder, right: cellBorder };
  const margins = { top: 70, bottom: 70, left: 110, right: 110 };

  const mkCell = (txt, c, isHead, zebra) => new TableCell({
    borders,
    width: { size: widths[c], type: WidthType.DXA },
    shading: { fill: isHead ? HEADFILL : (zebra ? ZEBRA : 'FFFFFF'), type: ShadingType.CLEAR },
    margins,
    verticalAlign: VerticalAlign.CENTER,
    children: (txt || '').split('<br>').map((piece, i) => new Paragraph({
      children: inlineRuns(piece, { size: 18, bold: isHead, color: isHead ? INK : '1F2937' }),
      spacing: { before: i === 0 ? 0 : 20, after: 0, line: 250 },
    })),
  });

  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: widths,
    rows: [
      new TableRow({ tableHeader: true, children: header.map((t, c) => mkCell(t, c, true, false)) }),
      ...body.map((r, ri) => new TableRow({
        children: Array.from({ length: nCols }, (_, c) => mkCell(r[c], c, false, ri % 2 === 1)),
      })),
    ],
  });
}

// ── main markdown walk ───────────────────────────────────────────────
const lines = src.split('\n');
const body = [];
let i = 0;

const HEAD_MAP = {
  1: HeadingLevel.HEADING_1,
  2: HeadingLevel.HEADING_2,
  3: HeadingLevel.HEADING_3,
  4: HeadingLevel.HEADING_4,
};

let firstH1Seen = false;

while (i < lines.length) {
  const line = lines[i];

  // fenced code
  if (/^\s*```/.test(line)) {
    const buf = []; i++;
    while (i < lines.length && !/^\s*```/.test(lines[i])) { buf.push(lines[i]); i++; }
    i++;
    body.push(...codeParas(buf));
    continue;
  }

  // table
  if (/^\s*\|/.test(line) && i + 1 < lines.length && /^\s*\|?[\s:-]*-[-\s:|]*\|/.test(lines[i + 1])) {
    const rows = [splitRow(line)];
    i += 2;
    while (i < lines.length && /^\s*\|/.test(lines[i])) { rows.push(splitRow(lines[i])); i++; }
    body.push(buildTable(rows));
    body.push(new Paragraph({ children: [], spacing: { after: 140 } }));
    continue;
  }

  // blockquote (consecutive)
  if (/^\s*>/.test(line)) {
    const buf = [];
    while (i < lines.length && /^\s*>/.test(lines[i])) {
      buf.push(lines[i].replace(/^\s*>\s?/, ''));
      i++;
    }
    body.push(...calloutParas(buf.filter((l) => l.trim() !== '')));
    continue;
  }

  // horizontal rule
  if (/^\s*---+\s*$/.test(line)) {
    body.push(new Paragraph({ children: [], border: rule(RULE, 4), spacing: { before: 80, after: 200 } }));
    i++; continue;
  }

  // heading
  const h = line.match(/^(#{1,4})\s+(.*)$/);
  if (h) {
    const lvl = h[1].length;
    let text = h[2].trim();
    const isPart = /^Part [AB] —/.test(text) || text === '附錄';
    body.push(new Paragraph({
      heading: HEAD_MAP[lvl],
      children: inlineRuns(text, {
        size: lvl === 1 ? 34 : lvl === 2 ? 26 : lvl === 3 ? 22 : 20,
        bold: true,
        color: lvl === 1 ? ACCENT : INK,
      }),
      spacing: {
        before: lvl === 1 ? 320 : lvl === 2 ? 260 : 200,
        after: lvl === 1 ? 180 : 120,
      },
      border: lvl <= 2 ? rule(lvl === 1 ? ACCENT : RULE, lvl === 1 ? 10 : 4) : undefined,
      pageBreakBefore: lvl === 1 && firstH1Seen && isPart,
    }));
    if (lvl === 1) firstH1Seen = true;
    i++; continue;
  }

  // list items (bullet / ordered / checkbox)
  const bullet = line.match(/^(\s*)[-*]\s+(.*)$/);
  const ordered = line.match(/^(\s*)(\d+)\.\s+(.*)$/);
  if (bullet || ordered) {
    const indentLvl = Math.min(Math.floor((bullet ? bullet[1] : ordered[1]).length / 2), 2);
    let txt = bullet ? bullet[2] : ordered[3];
    const cb = txt.match(/^\[( |x|X)\]\s*(.*)$/);
    if (cb) txt = (cb[1] === ' ' ? '☐ ' : '☑ ') + cb[2];
    body.push(new Paragraph({
      numbering: { reference: bullet ? 'md-bullets' : 'md-numbers', level: indentLvl },
      children: inlineRuns(txt, { size: 20 }),
      spacing: { before: 30, after: 60, line: 268 },
    }));
    i++; continue;
  }

  // blank
  if (line.trim() === '') { i++; continue; }

  // plain paragraph
  body.push(para(line.trim(), { size: 20 }));
  i++;
}

// ── cover page ───────────────────────────────────────────────────────
const cover = [
  new Paragraph({ children: [], spacing: { after: 2400 } }),
  new Paragraph({
    children: [new TextRun({ text: '', font: FONT })],
    border: { bottom: { style: BorderStyle.SINGLE, size: 24, color: ACCENT, space: 1 } },
    spacing: { after: 320 },
  }),
  new Paragraph({
    children: [new TextRun({ text: COVER_TITLE || 'Document', font: FONT, size: 52, bold: true, color: INK })],
    spacing: { after: 140 },
  }),
  ...(COVER_SUB ? [new Paragraph({
    children: [new TextRun({ text: COVER_SUB, font: FONT, size: 28, color: MUTED })],
    spacing: { after: 320 },
  })] : []),
  ...(COVER_META ? COVER_META.split('|').map((m) => new Paragraph({
    children: [new TextRun({ text: m.trim(), font: FONT, size: 20, color: MUTED })],
    spacing: { after: 60 },
  })) : []),
  new Paragraph({ children: [new PageBreak()] }),
  new Paragraph({
    children: [new TextRun({ text: 'Table of Contents', font: FONT, size: 30, bold: true, color: INK })],
    border: rule(ACCENT, 8),
    spacing: { after: 200 },
  }),
  new TableOfContents('toc', { hyperlink: true, headingStyleRange: '1-3' }),
  new Paragraph({ children: [new PageBreak()] }),
];

// ── document ─────────────────────────────────────────────────────────
const doc = new Document({
  creator: 'Unified Operation Platform',
  title: COVER_TITLE || 'Document',
  styles: {
    default: { document: { run: { font: FONT, size: 20, color: INK } } },
    paragraphStyles: [1, 2, 3, 4].map((n) => ({
      id: `Heading${n}`, name: `Heading ${n}`, basedOn: 'Normal', next: 'Normal', quickFormat: true,
      run: { font: FONT, bold: true, size: n === 1 ? 34 : n === 2 ? 26 : n === 3 ? 22 : 20 },
      paragraph: { outlineLevel: n - 1, spacing: { before: 240, after: 120 } },
    })),
  },
  numbering: {
    config: [
      {
        reference: 'md-bullets',
        levels: [0, 1, 2].map((l) => ({
          level: l, format: LevelFormat.BULLET, text: ['•', '◦', '▪'][l],
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 420 + l * 360, hanging: 280 } } },
        })),
      },
      {
        reference: 'md-numbers',
        levels: [0, 1, 2].map((l) => ({
          level: l, format: LevelFormat.DECIMAL, text: `%${l + 1}.`,
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 420 + l * 360, hanging: 280 } } },
        })),
      },
    ],
  },
  sections: [{
    properties: {
      page: { size: { width: PAGE_W, height: PAGE_H }, margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN } },
    },
    headers: {
      default: new Header({
        children: [new Paragraph({
          children: [
            new TextRun({ text: COVER_TITLE || '', font: FONT, size: 16, color: MUTED }),
            new TextRun({ text: `\t${COVER_SUB || ''}`, font: FONT, size: 16, color: MUTED }),
          ],
          tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
          border: rule(RULE, 4),
          spacing: { after: 120 },
        })],
      }),
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          children: [
            new TextRun({ text: 'Confidential — internal use only', font: FONT, size: 15, color: MUTED }),
            new TextRun({ text: '\t', font: FONT }),
            new TextRun({ text: 'Page ', font: FONT, size: 15, color: MUTED }),
            new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 15, color: MUTED }),
            new TextRun({ text: ' / ', font: FONT, size: 15, color: MUTED }),
            new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FONT, size: 15, color: MUTED }),
          ],
          tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
        })],
      }),
    },
    children: [...cover, ...body],
  }],
});

Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(outPath, buf);
  console.log(`WROTE ${outPath} (${buf.length} bytes) from ${inPath}`);
}).catch((e) => { console.error('FAILED', e); process.exit(1); });
