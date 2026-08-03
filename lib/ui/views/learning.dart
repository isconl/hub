import 'package:flutter/material.dart';

import '../../app_scope.dart';
import '../../theme.dart';
import '../../util/fmt.dart' as fmt;
import '../shell.dart' show ShellAppBar;
import '../widgets/common.dart';
import '../widgets/reader.dart';

/// Courses -> lessons -> reader. Lessons cache for offline reading.
class LearningView extends StatelessWidget {
  const LearningView({super.key});

  @override
  Widget build(BuildContext context) {
    final services = AppScope.of(context);
    return SnapshotView(
      snapshot: services.store.learning,
      builder: (context, data) {
        final courses = fmt.lm(fmt.m(data)['courses']);
        if (courses.isEmpty) {
          return const EmptyState(
            'No courses yet',
            'Courses live in the vault under memory/learning.',
            icon: Icons.school_rounded,
          );
        }
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            for (final course in courses)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: _CourseTile(course: course),
              ),
          ],
        );
      },
    );
  }
}

class _CourseTile extends StatelessWidget {
  const _CourseTile({required this.course});
  final Map<String, dynamic> course;

  @override
  Widget build(BuildContext context) {
    final lessons = fmt.lm(course['lessons']);
    final done = lessons
        .where((l) => fmt.s(l['status']).toLowerCase() == 'done')
        .length;
    final pct = lessons.isEmpty ? 0.0 : done / lessons.length;
    final courseId = fmt.s(course['ID']).isEmpty
        ? fmt.s(course['id'])
        : fmt.s(course['ID']);

    return Panel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  fmt.s(course['TITLE']).isEmpty
                      ? courseId
                      : fmt.s(course['TITLE']),
                  style: T.w600(T.body2),
                ),
              ),
              Text('$done/${lessons.length}',
                  style: T.mono.copyWith(color: C.greenBright)),
            ],
          ),
          const SizedBox(height: 8),
          ClipRRect(
            borderRadius: BorderRadius.circular(3),
            child: LinearProgressIndicator(value: pct, minHeight: 4),
          ),
          const SizedBox(height: 10),
          for (final lesson in lessons)
            InkWell(
              onTap: () => Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => LessonScreen(
                    course: courseId,
                    file: fmt.s(lesson['file']),
                    title: fmt.s(lesson['title']),
                    status: fmt.s(lesson['status']),
                  ),
                ),
              ),
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 6),
                child: Row(
                  children: [
                    Icon(
                      switch (fmt.s(lesson['status']).toLowerCase()) {
                        'done' => Icons.check_circle_rounded,
                        'learning' => Icons.play_circle_outline_rounded,
                        _ => Icons.circle_outlined,
                      },
                      size: 15,
                      color: switch (fmt.s(lesson['status']).toLowerCase()) {
                        'done' => C.green,
                        'learning' => C.amber,
                        _ => C.text3,
                      },
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        fmt.s(lesson['title']).isEmpty
                            ? fmt.s(lesson['file'])
                            : fmt.s(lesson['title']),
                        style: T.small.copyWith(
                          color: fmt.s(lesson['status']).toLowerCase() ==
                                  'done'
                              ? C.text3
                              : C.text2,
                        ),
                      ),
                    ),
                    const Icon(Icons.chevron_right_rounded,
                        size: 15, color: C.text3),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class LessonScreen extends StatefulWidget {
  const LessonScreen({
    super.key,
    required this.course,
    required this.file,
    required this.title,
    required this.status,
  });

  final String course;
  final String file;
  final String title;
  final String status;

  @override
  State<LessonScreen> createState() => _LessonScreenState();
}

class _LessonScreenState extends State<LessonScreen> {
  late String _status = widget.status;
  final _scroll = ScrollController();

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final services = AppScope.of(context);
    final snap = services.store.detail(
      'lesson',
      '${widget.course}/${widget.file}',
      '/api/learning/lesson?course=${Uri.encodeComponent(widget.course)}&file=${Uri.encodeComponent(widget.file)}',
    );
    final heading = widget.title.isEmpty ? widget.file : widget.title;

    return Scaffold(
      appBar: ShellAppBar(title: heading, showBrand: false),
      body: Column(
        children: [
          ReadingProgress(controller: _scroll),
          Expanded(
            child: SnapshotView(
              snapshot: snap,
              controller: _scroll,
              // The reading surface owns its own margins, so the scroll view
              // contributes nothing horizontally. Bottom room is for the
              // thumb, not for a nav bar - this screen is pushed, not tabbed.
              padding: const EdgeInsets.fromLTRB(0, 0, 0, 56),
              builder: (context, data) {
                final content = fmt.s(fmt.m(data)['content']);
                return ReadingSurface(
                  children: [
                    ReadingHeader(
                      title: heading,
                      kicker: widget.course,
                      meta: content.isEmpty ? null : readingMeta(content),
                      trailing: Row(
                        children: [
                          for (final st in ['new', 'learning', 'done']) ...[
                            Pill(st,
                                selected: _status.toLowerCase() == st,
                                onTap: () async {
                                  setState(() => _status = st);
                                  final res = await services.mutations
                                      .lessonProgress(
                                          widget.course, widget.file, st);
                                  if (!context.mounted) return;
                                  if (!res.ok) {
                                    toast(context, res.error!, error: true);
                                  } else if (res.queued) {
                                    toast(context,
                                        'Progress queued - will sync');
                                  }
                                }),
                            const SizedBox(width: 6),
                          ],
                        ],
                      ),
                    ),
                    if (content.isEmpty)
                      Padding(
                        padding: const EdgeInsets.only(top: 26),
                        child: Text(
                          'Lesson content loads when online, then stays cached '
                          'on this device for reading offline.',
                          style: T.body2.copyWith(color: C.text3, height: 1.6),
                        ),
                      )
                    else
                      ReadingBody(content),
                    _LessonNotes(course: widget.course, file: widget.file),
                  ],
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

/// Margin notes on a lesson.
///
/// Two other readers besides him: the tutor loads them as context, and the
/// agent reads them when revising the course - a note saying "this section is
/// now wrong" is the cheapest possible course-update instruction. Which is why
/// this is worth having on the phone, where most of the reading happens.
class _LessonNotes extends StatefulWidget {
  const _LessonNotes({required this.course, required this.file});
  final String course;
  final String file;

  @override
  State<_LessonNotes> createState() => _LessonNotesState();
}

class _LessonNotesState extends State<_LessonNotes> {
  final _controller = TextEditingController();
  bool _open = false;
  bool _loading = false;
  bool _loaded = false;
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    if (_loaded || _loading) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final res = await AppScope.of(context).api.getJson(
            '/api/learning/notes?course=${Uri.encodeQueryComponent(widget.course)}'
            '&file=${Uri.encodeQueryComponent(widget.file)}',
          );
      if (!mounted) return;
      _controller.text = fmt.s(fmt.m(res)['text']);
      setState(() => _loaded = true);
    } catch (e) {
      if (mounted) {
        setState(() => _error = 'Could not load your notes ($e).');
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    final res = await AppScope.of(context).mutations.saveLessonNote(
          course: widget.course,
          file: widget.file,
          text: _controller.text,
        );
    if (!mounted) return;
    setState(() => _saving = false);
    if (!res.ok) {
      toast(context, res.error!, error: true);
    } else if (res.queued) {
      toast(context, 'Note queued - will sync');
    } else {
      toast(context, 'Note saved');
    }
  }

  @override
  Widget build(BuildContext context) {
    return ReadingSection(
      label: 'Your notes',
      trailing: InkWell(
        borderRadius: BorderRadius.circular(Sz.rSm),
        onTap: () {
          setState(() => _open = !_open);
          if (_open) _load();
        },
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (_loading) ...[const MiniSpinner(), const SizedBox(width: 8)],
              Text(_open ? 'Close' : 'Write', style: T.tiny.copyWith(color: C.green)),
              Icon(
                  _open
                      ? Icons.expand_less_rounded
                      : Icons.expand_more_rounded,
                  size: 16,
                  color: C.green),
            ],
          ),
        ),
      ),
      child: !_open
          ? Text(
              'What you made of it. The tutor loads these as context, and the '
              'agent reads them when it revises the course.',
              style: T.body2.copyWith(color: C.text3, height: 1.6),
            )
          : Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (_error != null)
                  ErrorRetry(_error!, onRetry: () {
                    _loaded = false;
                    _load();
                  }),
                // Borderless while resting, so the note field reads as more
                // page rather than as a widget dropped onto one. The green
                // underline on focus is the only state it needs.
                TextField(
                  controller: _controller,
                  maxLines: null,
                  minLines: 5,
                  style: T.body.copyWith(
                      fontSize: 15, height: 1.62, color: C.text),
                  decoration: InputDecoration(
                    filled: false,
                    contentPadding: const EdgeInsets.symmetric(vertical: 6),
                    hintText: 'Write it here.',
                    hintStyle: T.body2.copyWith(color: C.text3, fontSize: 15),
                    enabledBorder: const UnderlineInputBorder(
                        borderSide: BorderSide(color: C.border)),
                    focusedBorder: const UnderlineInputBorder(
                        borderSide: BorderSide(color: C.green)),
                  ),
                ),
                const SizedBox(height: 16),
                Align(
                  alignment: Alignment.centerLeft,
                  child: FilledButton.icon(
                    onPressed: _saving ? null : _save,
                    icon: _saving
                        ? const MiniSpinner()
                        : const Icon(Icons.save_rounded, size: 16),
                    label: const Text('Save note'),
                  ),
                ),
              ],
            ),
    );
  }
}
