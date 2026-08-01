import 'package:flutter/widgets.dart';

import 'api/client.dart';
import 'data/db.dart';
import 'data/mutations.dart';
import 'data/outbox.dart';
import 'data/store.dart';
import 'data/sync.dart';
import 'services/session.dart';
import 'services/updater.dart';

/// Composition root: one instance of every service, built in main().
class AppServices {
  AppServices._({
    required this.db,
    required this.session,
    required this.store,
    required this.outbox,
    required this.sync,
    required this.mutations,
    required this.updater,
  });

  final AppDb db;
  final SessionService session;
  final Store store;
  final OutboxService outbox;
  final SyncEngine sync;
  final Mutations mutations;
  final UpdateService updater;

  ApiClient get api => session.api;

  static Future<AppServices> boot() async {
    final db = await AppDb.open();
    final session = SessionService();
    await session.load();
    ApiClient apiOf() => session.api;
    final store = Store(db, apiOf);
    final outbox = OutboxService(db, apiOf);
    final sync = SyncEngine(store, outbox, apiOf);
    final mutations = Mutations(store, outbox, sync, apiOf);
    final updater = UpdateService(apiOf);
    await outbox.refreshCount();
    await updater.loadInstalled();
    return AppServices._(
      db: db,
      session: session,
      store: store,
      outbox: outbox,
      sync: sync,
      mutations: mutations,
      updater: updater,
    );
  }
}

class AppScope extends InheritedWidget {
  const AppScope({super.key, required this.services, required super.child});

  final AppServices services;

  static AppServices of(BuildContext context) => context
      .dependOnInheritedWidgetOfExactType<AppScope>()!
      .services;

  @override
  bool updateShouldNotify(AppScope oldWidget) =>
      services != oldWidget.services;
}
