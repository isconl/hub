import 'package:flutter/foundation.dart';

import '../api/client.dart';
import '../util/fmt.dart' as fmt;
import 'db.dart';
import 'store.dart';

/// The local module library.
///
/// ARCHITECT reads learning modules on his phone, often with no signal, and a module
/// written to the depth standard is a long read. So the rule he asked for is:
/// **once a module is downloaded it stays downloaded, until the module itself
/// changes.** Not until a cache expires, not until the next sync, not until the
/// app is reinstalled. Until the content moves.
///
/// The body is already cached in SQLite by [Snapshot] - what was missing was any
/// way to know the day it went stale. A client holding a body cannot infer that
/// from the body. So the agent publishes `/api/learning/manifest`: every module
/// with a content revision. This class compares that against what is on the
/// device and answers three questions the UI needs:
///
///   * is this module downloaded?
///   * is the downloaded copy still current?
///   * how much of the course is readable offline right now?
///
/// The revision is a hash of the bytes, not a timestamp. The vault round-trips
/// through OneDrive, so mtimes move without content moving; a timestamp
/// comparison would re-download the whole library after every mirror pass and
/// would still miss an edit that landed with an unchanged clock.
///
/// Nothing here ever evicts. A module leaves the device when ARCHITECT says so
/// ([forget]), not when a policy decides the disk would look tidier.
enum ModuleState {
  /// Never downloaded on this device.
  absent,

  /// Downloaded, and the copy matches what the agent holds.
  current,

  /// Downloaded, but the agent's copy has moved on.
  stale,

  /// Downloaded before the agent published revisions, so it cannot be compared.
  /// Treated as readable but refreshable - never discarded.
  unversioned,
}

class ModuleStatus {
  const ModuleStatus(this.state, {this.rev, this.bytes, this.updated});
  final ModuleState state;
  final String? rev;
  final int? bytes;
  final String? updated;

  bool get downloaded => state != ModuleState.absent;
  bool get needsRefresh => state == ModuleState.stale || state == ModuleState.absent;
}

class ModuleLibrary extends ChangeNotifier {
  ModuleLibrary(this._db, this._store, this._api);

  final AppDb _db;
  final Store _store;
  final ApiClient Function() _api;

  /// course/file -> manifest entry, as published by the agent.
  final Map<String, Map<String, dynamic>> _manifest = {};

  /// course/file -> revision of the copy on this device.
  final Map<String, String> _local = {};

  bool _loaded = false;
  bool busy = false;
  DateTime? checkedAt;

  static String keyOf(String course, String file) => '$course/$file';
  static String snapshotKey(String course, String file) => 'lesson:$course/$file';

  /// How many modules are readable with no connection.
  int get downloadedCount => _local.length;

  int get staleCount => _local.keys
      .where((k) => _manifest[k] != null && _manifest[k]!['rev'] != _local[k])
      .length;

  /// Every module the agent knows about, whether or not it is on the device.
  int get knownCount => _manifest.length;

  ModuleStatus status(String course, String file) {
    final k = keyOf(course, file);
    final entry = _manifest[k];
    final localRev = _local[k];
    if (localRev == null) {
      return ModuleStatus(ModuleState.absent,
          rev: fmt.s(entry?['rev']).isEmpty ? null : fmt.s(entry?['rev']),
          bytes: entry == null ? null : fmt.i(entry['bytes']),
          updated: entry == null ? null : fmt.s(entry['updated']));
    }
    if (localRev.isEmpty) {
      return const ModuleStatus(ModuleState.unversioned);
    }
    if (entry == null) {
      // On the device, absent from the manifest. Keep it - it may be a module
      // the agent has not published yet, and deleting a body the user can read
      // to tidy an index is never the right trade.
      return ModuleStatus(ModuleState.current, rev: localRev);
    }
    final remote = fmt.s(entry['rev']);
    return ModuleStatus(
      remote.isEmpty || remote == localRev ? ModuleState.current : ModuleState.stale,
      rev: localRev,
      bytes: fmt.i(entry['bytes']),
      updated: fmt.s(entry['updated']),
    );
  }

  /// Read what the device already holds. Cheap: one indexed scan, no network.
  Future<void> load() async {
    if (_loaded) return;
    _loaded = true;
    await _rescanLocal();
    notifyListeners();
  }

  Future<void> _rescanLocal() async {
    _local.clear();
    for (final key in await _db.snapshotKeysWithPrefix('lesson:')) {
      final row = await _db.getSnapshot(key);
      if (row == null) continue;
      final id = key.substring('lesson:'.length);
      // An empty string records "downloaded, but before revisions existed".
      _local[id] = fmt.s(fmt.m(row.$1)['rev']);
    }
  }

  /// Ask the agent what it holds. Safe offline: the library keeps working from
  /// whatever it knew last, which is the entire point of it.
  Future<void> check({bool force = false}) async {
    if (busy) return;
    if (!force && checkedAt != null &&
        DateTime.now().difference(checkedAt!) < const Duration(minutes: 2)) {
      return;
    }
    busy = true;
    notifyListeners();
    try {
      final res = await _api().getJson('/api/learning/manifest');
      final lessons = fmt.lm(fmt.m(res)['lessons']);
      _manifest.clear();
      for (final l in lessons) {
        final course = fmt.s(l['course']);
        final file = fmt.s(l['file']);
        if (course.isEmpty || file.isEmpty) continue;
        _manifest[keyOf(course, file)] = l;
      }
      checkedAt = DateTime.now();
      await _rescanLocal();
    } catch (_) {
      // Offline or unreachable. Deliberately silent: a failed manifest check
      // must never make a downloaded module look absent.
    } finally {
      busy = false;
      notifyListeners();
    }
  }

  /// Pull one module onto the device, or refresh it because its revision moved.
  /// Returns true when a body is on disk afterwards.
  Future<bool> download(String course, String file) async {
    final snap = _store.detail(
      'lesson',
      keyOf(course, file),
      '/api/learning/lesson?course=${Uri.encodeComponent(course)}'
      '&file=${Uri.encodeComponent(file)}',
    );
    final ok = await snap.refresh();
    if (ok) {
      _local[keyOf(course, file)] = fmt.s(fmt.m(snap.value)['rev']);
      notifyListeners();
    }
    return ok || snap.hasData;
  }

  /// Refresh only what actually moved, and only when online.
  ///
  /// Called after a full sync. On a library of ninety modules this is usually
  /// zero requests, which is the difference between "cached" and "kept".
  Future<int> refreshStale({int limit = 25}) async {
    final stale = _local.keys
        .where((k) => _manifest[k] != null && fmt.s(_manifest[k]!['rev']) != _local[k])
        .take(limit)
        .toList();
    var done = 0;
    for (final k in stale) {
      final parts = k.split('/');
      if (parts.length != 2) continue;
      if (await download(parts[0], parts[1])) done++;
    }
    return done;
  }

  /// Download a whole course for offline reading. Sequential on purpose - a
  /// phone on a weak connection does worse with twenty parallel requests than
  /// with twenty in a row.
  Future<int> downloadCourse(String course, List<String> files,
      {void Function(int done, int total)? onProgress}) async {
    var done = 0;
    for (final f in files) {
      final st = status(course, f);
      if (st.state == ModuleState.current) { done++; onProgress?.call(done, files.length); continue; }
      if (await download(course, f)) done++;
      onProgress?.call(done, files.length);
    }
    return done;
  }

  /// Remove a downloaded body. Only ever called because ARCHITECT asked.
  Future<void> forget(String course, String file) async {
    await _db.deleteSnapshot(snapshotKey(course, file));
    _local.remove(keyOf(course, file));
    notifyListeners();
  }
}
