import 'package:flutter/material.dart';

import '../../app_scope.dart';
import '../../theme.dart';
import '../../util/fmt.dart' as fmt;
import '../widgets/common.dart';

/// Decision log + risk register, from /api/refs.
/// Decision IDs render green, risk IDs red - same semantic colors as the web.
class DecisionsView extends StatelessWidget {
  const DecisionsView({super.key});

  @override
  Widget build(BuildContext context) {
    final services = AppScope.of(context);
    return SnapshotView(
      snapshot: services.store.refs,
      builder: (context, data) {
        final refs = fmt.m(fmt.m(data)['refs']);
        final decisions = <MapEntry<String, Map<String, dynamic>>>[];
        final risks = <MapEntry<String, Map<String, dynamic>>>[];
        final playbooks = <MapEntry<String, Map<String, dynamic>>>[];
        for (final entry in refs.entries) {
          final val = fmt.m(entry.value);
          switch (fmt.s(val['kind'])) {
            case 'decision':
              decisions.add(MapEntry(entry.key, val));
            case 'risk':
              risks.add(MapEntry(entry.key, val));
            case 'playbook':
              playbooks.add(MapEntry(entry.key, val));
          }
        }
        int byId(MapEntry<String, dynamic> a, MapEntry<String, dynamic> b) =>
            a.key.compareTo(b.key);
        decisions.sort(byId);
        risks.sort(byId);
        playbooks.sort(byId);

        if (decisions.isEmpty && risks.isEmpty && playbooks.isEmpty) {
          return const EmptyState(
            'No governance refs yet',
            'Decisions (D-xxx), risks (R-xxx) and playbooks (PB-xx) '
                'appear here from the career vault.',
            icon: Icons.gavel_rounded,
          );
        }

        Widget section(String label, List<MapEntry<String, Map<String, dynamic>>> items,
            Color idColor) {
          if (items.isEmpty) return const SizedBox.shrink();
          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              SectionLabel('$label · ${items.length}'),
              Panel(
                padding: EdgeInsets.zero,
                child: Column(
                  children: [
                    for (var idx = 0; idx < items.length; idx++) ...[
                      if (idx > 0) const Divider(),
                      Padding(
                        padding: const EdgeInsets.symmetric(
                            horizontal: Sz.pad, vertical: 10),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            SizedBox(
                              width: 52,
                              child: Text(items[idx].key,
                                  style: T.monoSmall
                                      .copyWith(color: idColor)),
                            ),
                            Expanded(
                              child: Text(fmt.s(items[idx].value['title']),
                                  style: T.small),
                            ),
                            if (fmt
                                .s(items[idx].value['status'])
                                .isNotEmpty) ...[
                              const SizedBox(width: 8),
                              Badge2(
                                fmt.s(items[idx].value['status']),
                                color: _statusColor(
                                        fmt.s(items[idx].value['status']))
                                    .withValues(alpha: 0.12),
                                textColor: _statusColor(
                                    fmt.s(items[idx].value['status'])),
                              ),
                            ],
                          ],
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ],
          );
        }

        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            section('Decisions', decisions, C.green),
            section('Risks', risks, C.red),
            section('Playbooks', playbooks, C.cyan),
          ],
        );
      },
    );
  }

  Color _statusColor(String status) => switch (status.toLowerCase()) {
        'open' || 'pending' || 'chasing' => C.amber,
        'closed' || 'decided' || 'mitigated' || 'done' => C.green,
        'tripped' || 'critical' || 'blocked' => C.red,
        _ => C.text3,
      };
}
