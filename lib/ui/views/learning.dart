import 'package:flutter/material.dart';

import '../../app_scope.dart';
import '../../theme.dart';
import '../../util/fmt.dart' as fmt;
import '../../util/markdown.dart';
import '../shell.dart' show ShellAppBar;
import '../widgets/common.dart';

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

  @override
  Widget build(BuildContext context) {
    final services = AppScope.of(context);
    final snap = services.store.detail(
      'lesson',
      '${widget.course}/${widget.file}',
      '/api/learning/lesson?course=${Uri.encodeComponent(widget.course)}&file=${Uri.encodeComponent(widget.file)}',
    );
    return Scaffold(
      appBar: ShellAppBar(
          title: widget.title.isEmpty ? widget.file : widget.title,
          showBrand: false),
      body: SnapshotView(
        snapshot: snap,
        builder: (context, data) {
          final content = fmt.s(fmt.m(data)['content']);
          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
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
                            toast(context, 'Progress queued - will sync');
                          }
                        }),
                    const SizedBox(width: 6),
                  ],
                ],
              ),
              const SizedBox(height: 12),
              if (content.isEmpty)
                const Panel(
                    child: Text(
                        'Lesson content loads when online, then stays cached.'))
              else
                Panel(child: Markdown(content)),
            ],
          );
        },
      ),
    );
  }
}
