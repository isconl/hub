import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../theme.dart';

/// Compact markdown renderer covering what the agent actually emits:
/// headings, bold/italic, inline + fenced code, lists, blockquotes,
/// horizontal rules, links and tables. No external dependency, fully offline.
class Markdown extends StatelessWidget {
  const Markdown(this.source, {super.key, this.baseStyle});
  final String source;
  final TextStyle? baseStyle;

  @override
  Widget build(BuildContext context) {
    final style = baseStyle ?? T.body2.copyWith(color: C.text, height: 1.55);
    final blocks = _parseBlocks(source);
    final children = <Widget>[];
    for (final block in blocks) {
      final w = _renderBlock(block, style);
      if (w != null) children.add(w);
    }
    if (children.isEmpty) return const SizedBox.shrink();
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: children);
  }

  Widget? _renderBlock(_Block block, TextStyle style) {
    switch (block.kind) {
      case _Kind.heading:
        final size = switch (block.level) {
          1 => 17.0,
          2 => 15.5,
          3 => 14.5,
          _ => 13.5,
        };
        return Padding(
          padding: const EdgeInsets.only(top: 12, bottom: 4),
          child: Text.rich(
            _inline(block.text,
                style.copyWith(fontSize: size, fontWeight: FontWeight.w600)),
          ),
        );
      case _Kind.code:
        return Container(
          width: double.infinity,
          margin: const EdgeInsets.symmetric(vertical: 6),
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(
            color: C.bg,
            border: Border.all(color: C.border),
            borderRadius: BorderRadius.circular(Sz.rSm),
          ),
          child: Text(block.text, style: T.mono.copyWith(color: C.text2)),
        );
      case _Kind.quote:
        return Container(
          margin: const EdgeInsets.symmetric(vertical: 6),
          padding: const EdgeInsets.only(left: 10),
          decoration: const BoxDecoration(
            border: Border(left: BorderSide(color: C.green, width: 2)),
          ),
          child: Text.rich(_inline(block.text, style.copyWith(color: C.text2))),
        );
      case _Kind.rule:
        return const Padding(
          padding: EdgeInsets.symmetric(vertical: 8),
          child: Divider(),
        );
      case _Kind.listItem:
        final bullet = block.ordered ? '${block.index}.' : '•';
        return Padding(
          padding: EdgeInsets.only(left: 4.0 + block.level * 14, top: 2, bottom: 2),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SizedBox(
                width: block.ordered ? 22 : 14,
                child: Text(bullet,
                    style: style.copyWith(color: C.green, fontWeight: FontWeight.w600)),
              ),
              Expanded(child: Text.rich(_inline(block.text, style))),
            ],
          ),
        );
      case _Kind.table:
        return _table(block, style);
      case _Kind.paragraph:
        if (block.text.trim().isEmpty) return null;
        return Padding(
          padding: const EdgeInsets.symmetric(vertical: 3),
          child: Text.rich(_inline(block.text, style)),
        );
    }
  }

  Widget _table(_Block block, TextStyle style) {
    final rows = block.rows;
    if (rows.isEmpty) return const SizedBox.shrink();
    return Container(
      margin: const EdgeInsets.symmetric(vertical: 6),
      decoration: BoxDecoration(
        border: Border.all(color: C.border),
        borderRadius: BorderRadius.circular(Sz.rSm),
      ),
      clipBehavior: Clip.antiAlias,
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Table(
          defaultColumnWidth: const IntrinsicColumnWidth(),
          border: const TableBorder(
            horizontalInside: BorderSide(color: C.border),
            verticalInside: BorderSide(color: C.border),
          ),
          children: [
            for (var r = 0; r < rows.length; r++)
              TableRow(
                decoration: BoxDecoration(color: r == 0 ? C.surface : null),
                children: [
                  for (final cell in rows[r])
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                      child: Text.rich(_inline(
                          cell,
                          r == 0
                              ? style.copyWith(
                                  fontWeight: FontWeight.w600, fontSize: 12)
                              : style.copyWith(fontSize: 12))),
                    ),
                ],
              ),
          ],
        ),
      ),
    );
  }

  /// Inline markdown: **bold**, *italic*, `code`, [text](url).
  TextSpan _inline(String text, TextStyle style) {
    final spans = <InlineSpan>[];
    final pattern = RegExp(
        r'(\*\*(.+?)\*\*)|(\*([^*]+?)\*)|(_([^_]+?)_)|(`([^`]+?)`)|(\[([^\]]+)\]\(([^)]+)\))');
    var pos = 0;
    for (final match in pattern.allMatches(text)) {
      if (match.start > pos) {
        spans.add(TextSpan(text: text.substring(pos, match.start)));
      }
      if (match.group(1) != null) {
        spans.add(TextSpan(
            text: match.group(2),
            style: const TextStyle(fontWeight: FontWeight.w600)));
      } else if (match.group(3) != null) {
        spans.add(TextSpan(
            text: match.group(4),
            style: const TextStyle(fontStyle: FontStyle.italic)));
      } else if (match.group(5) != null) {
        spans.add(TextSpan(
            text: match.group(6),
            style: const TextStyle(fontStyle: FontStyle.italic)));
      } else if (match.group(7) != null) {
        spans.add(TextSpan(
          text: match.group(8),
          style: T.mono.copyWith(
              color: C.greenBright,
              fontSize: (style.fontSize ?? 13) - 1,
              backgroundColor: C.surface),
        ));
      } else if (match.group(9) != null) {
        final url = match.group(11)!;
        spans.add(TextSpan(
          text: match.group(10),
          style: const TextStyle(
              color: C.cyan, decoration: TextDecoration.underline,
              decorationColor: C.cyan),
          recognizer: TapGestureRecognizer()
            ..onTap = () {
              final uri = Uri.tryParse(url);
              if (uri != null) {
                launchUrl(uri, mode: LaunchMode.externalApplication);
              }
            },
        ));
      }
      pos = match.end;
    }
    if (pos < text.length) spans.add(TextSpan(text: text.substring(pos)));
    return TextSpan(style: style, children: spans);
  }
}

enum _Kind { paragraph, heading, code, quote, rule, listItem, table }

class _Block {
  _Block(this.kind,
      {this.text = '',
      this.level = 0,
      this.ordered = false,
      this.index = 0,
      this.rows = const []});
  final _Kind kind;
  final String text;
  final int level;
  final bool ordered;
  final int index;
  final List<List<String>> rows;
}

List<_Block> _parseBlocks(String source) {
  final lines = source.replaceAll('\r\n', '\n').split('\n');
  final blocks = <_Block>[];
  var idx = 0;
  final para = <String>[];

  void flushPara() {
    if (para.isNotEmpty) {
      blocks.add(_Block(_Kind.paragraph, text: para.join(' ')));
      para.clear();
    }
  }

  while (idx < lines.length) {
    final line = lines[idx];
    final trimmed = line.trimRight();

    // fenced code
    if (trimmed.trimLeft().startsWith('```')) {
      flushPara();
      final buf = <String>[];
      idx++;
      while (idx < lines.length && !lines[idx].trimLeft().startsWith('```')) {
        buf.add(lines[idx]);
        idx++;
      }
      idx++; // closing fence
      blocks.add(_Block(_Kind.code, text: buf.join('\n')));
      continue;
    }

    // table: header row | separator row
    if (trimmed.startsWith('|') &&
        idx + 1 < lines.length &&
        RegExp(r'^\s*\|?[\s:|-]+\|?\s*$').hasMatch(lines[idx + 1]) &&
        lines[idx + 1].contains('-')) {
      flushPara();
      final rows = <List<String>>[_splitRow(trimmed)];
      idx += 2;
      while (idx < lines.length && lines[idx].trimRight().startsWith('|')) {
        rows.add(_splitRow(lines[idx].trimRight()));
        idx++;
      }
      blocks.add(_Block(_Kind.table, rows: rows));
      continue;
    }

    final heading = RegExp(r'^(#{1,6})\s+(.*)$').firstMatch(trimmed);
    if (heading != null) {
      flushPara();
      blocks.add(_Block(_Kind.heading,
          text: heading.group(2)!, level: heading.group(1)!.length));
      idx++;
      continue;
    }

    if (RegExp(r'^\s*([-*_])\s*\1\s*\1[\s\-*_]*$').hasMatch(trimmed) &&
        trimmed.isNotEmpty) {
      flushPara();
      blocks.add(_Block(_Kind.rule));
      idx++;
      continue;
    }

    if (trimmed.startsWith('>')) {
      flushPara();
      final buf = <String>[trimmed.replaceFirst(RegExp(r'^>\s?'), '')];
      idx++;
      while (idx < lines.length && lines[idx].trimRight().startsWith('>')) {
        buf.add(lines[idx].trimRight().replaceFirst(RegExp(r'^>\s?'), ''));
        idx++;
      }
      blocks.add(_Block(_Kind.quote, text: buf.join(' ')));
      continue;
    }

    final unordered = RegExp(r'^(\s*)[-*+]\s+(.*)$').firstMatch(line);
    if (unordered != null) {
      flushPara();
      blocks.add(_Block(_Kind.listItem,
          text: unordered.group(2)!,
          level: (unordered.group(1)!.length / 2).floor()));
      idx++;
      continue;
    }

    final ordered = RegExp(r'^(\s*)(\d+)[.)]\s+(.*)$').firstMatch(line);
    if (ordered != null) {
      flushPara();
      blocks.add(_Block(_Kind.listItem,
          text: ordered.group(3)!,
          ordered: true,
          index: int.tryParse(ordered.group(2)!) ?? 1,
          level: (ordered.group(1)!.length / 2).floor()));
      idx++;
      continue;
    }

    if (trimmed.isEmpty) {
      flushPara();
      idx++;
      continue;
    }

    para.add(trimmed);
    idx++;
  }
  flushPara();
  return blocks;
}

List<String> _splitRow(String row) {
  var body = row.trim();
  if (body.startsWith('|')) body = body.substring(1);
  if (body.endsWith('|')) body = body.substring(0, body.length - 1);
  return body.split('|').map((c) => c.trim()).toList();
}
