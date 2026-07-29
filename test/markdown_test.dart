import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:isconl/util/markdown.dart';

void main() {
  Future<void> pump(WidgetTester tester, String source) async {
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(body: SingleChildScrollView(child: Markdown(source))),
    ));
  }

  testWidgets('renders headings, lists and bold', (tester) async {
    await pump(tester, '''
# Title
Some **bold** text and *italic*.

- first item
- second item

1. numbered
''');
    expect(find.textContaining('Title'), findsOneWidget);
    expect(find.textContaining('first item'), findsOneWidget);
    expect(find.textContaining('numbered'), findsOneWidget);
  });

  testWidgets('renders fenced code without crashing', (tester) async {
    await pump(tester, 'before\n```\ncode line\n```\nafter');
    expect(find.text('code line'), findsOneWidget);
  });

  testWidgets('renders tables', (tester) async {
    await pump(tester, '| a | b |\n|---|---|\n| 1 | 2 |');
    expect(find.text('a'), findsOneWidget);
    expect(find.text('2'), findsOneWidget);
  });

  testWidgets('empty input renders nothing', (tester) async {
    await pump(tester, '');
    expect(find.byType(Markdown), findsOneWidget);
  });
}
