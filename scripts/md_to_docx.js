#!/usr/bin/env node
// Minimal Markdown -> DOCX converter for headings, paragraphs, pipe tables,
// bold spans and horizontal rules. Good enough for the four Viva documents;
// not a general-purpose Markdown engine.
const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow,
  TableCell, WidthType, BorderStyle, AlignmentType,
} = require('D:/work/dev/iSconl/scope/node_modules/docx');

function parseInline(text) {
  // Splits on **bold** spans, returns array of TextRun.
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(s => s.length > 0);
  return parts.map(p => {
    if (p.startsWith('**') && p.endsWith('**')) {
      return new TextRun({ text: p.slice(2, -2), bold: true });
    }
    return new TextRun({ text: p });
  });
}

function cellBorders() {
  const b = { style: BorderStyle.SINGLE, size: 2, color: 'CCCCCC' };
  return { top: b, bottom: b, left: b, right: b };
}

function buildTable(rows) {
  // rows: array of array-of-strings, first row is header.
  const colCount = rows[0].length;
  const trs = rows.map((cells, ri) => new TableRow({
    tableHeader: ri === 0,
    children: cells.map(c => new TableCell({
      borders: cellBorders(),
      width: { size: Math.floor(100 / colCount), type: WidthType.PERCENTAGE },
      shading: ri === 0 ? { fill: 'EFEFEF' } : undefined,
      children: [new Paragraph({ children: parseInline(c), spacing: { after: 40 } })],
    })),
  }));
  return new Table({ rows: trs, width: { size: 100, type: WidthType.PERCENTAGE } });
}

function convert(mdText) {
  const lines = mdText.split(/\r?\n/);
  const children = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === '') { i++; continue; }

    if (line.trim() === '---') {
      children.push(new Paragraph({ text: '', border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'AAAAAA' } } }));
      i++; continue;
    }

    if (line.startsWith('# ')) {
      children.push(new Paragraph({ text: line.slice(2).trim(), heading: HeadingLevel.TITLE }));
      i++; continue;
    }
    if (line.startsWith('## ')) {
      children.push(new Paragraph({ text: line.slice(3).trim(), heading: HeadingLevel.HEADING_1, spacing: { before: 240, after: 120 } }));
      i++; continue;
    }
    if (line.startsWith('### ')) {
      children.push(new Paragraph({ text: line.slice(4).trim(), heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 100 } }));
      i++; continue;
    }

    // Numbered list item "1. text"
    const numMatch = line.match(/^(\d+)\.\s+(.*)$/);
    if (numMatch) {
      children.push(new Paragraph({ children: parseInline(numMatch[2]), numbering: { reference: 'default-numbering', level: 0 } }));
      i++; continue;
    }

    // Pipe table: collect contiguous lines starting with |
    if (line.trim().startsWith('|')) {
      const tableLines = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        tableLines.push(lines[i]);
        i++;
      }
      const rows = tableLines
        .filter(l => !/^\|[\s:-]+\|$/.test(l.replace(/\s/g, '').replace(/\|/g, '|'))) // drop separator rows below
        .map(l => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim()));
      // Remove markdown separator rows like |---|---|
      const dataRows = rows.filter(r => !r.every(c => /^:?-+:?$/.test(c)));
      if (dataRows.length) children.push(buildTable(dataRows));
      children.push(new Paragraph({ text: '' }));
      continue;
    }

    // Plain paragraph
    children.push(new Paragraph({ children: parseInline(line), spacing: { after: 160 } }));
    i++;
  }
  return children;
}

const [, , inputPath, outputPath, orientation] = process.argv;
const md = fs.readFileSync(inputPath, 'utf8');
const children = convert(md);

const doc = new Document({
  numbering: {
    config: [{
      reference: 'default-numbering',
      levels: [{ level: 0, format: 'decimal', text: '%1.', alignment: AlignmentType.START }],
    }],
  },
  sections: [{
    properties: orientation === 'landscape' ? { page: { size: { orientation: 'landscape' } } } : {},
    children,
  }],
  styles: {
    default: {
      document: { run: { font: 'Calibri', size: 22 } },
    },
  },
});

Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync(outputPath, buf);
  console.log(`wrote ${outputPath} (${buf.length} bytes)`);
});
