import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:package_info_plus/package_info_plus.dart';
import 'package:path_provider/path_provider.dart';

import 'platform.dart';

/// Self-update on cue.
///
/// Every CI build on the `apk` branch publishes a GitHub Release tagged
/// `apk-vX.Y.Z` with the versioned APK attached. "Check for update" compares
/// that against the installed version and, if newer, downloads the asset and
/// hands it to the Android package installer.
///
/// The repo is private, so a fine-grained PAT (contents: read) is required -
/// stored in secure storage via Settings.
class UpdateService extends ChangeNotifier {
  UpdateService(this._patProvider);

  final String Function() _patProvider;
  static const _repo = 'Sconl/isconl-agent';

  String installedVersion = '';
  String? latestVersion;
  String? state; // human status line
  bool busy = false;
  double progress = 0;

  Future<void> loadInstalled() async {
    final info = await PackageInfo.fromPlatform();
    installedVersion = info.version;
    notifyListeners();
  }

  Map<String, String> get _headers {
    final pat = _patProvider();
    return {
      'Accept': 'application/vnd.github+json',
      if (pat.isNotEmpty) 'Authorization': 'Bearer $pat',
      'X-GitHub-Api-Version': '2022-11-28',
    };
  }

  /// Returns null if up to date, otherwise the newer version string.
  Future<String?> check() async {
    busy = true;
    state = 'Checking latest release…';
    notifyListeners();
    try {
      final res = await http
          .get(Uri.parse('https://api.github.com/repos/$_repo/releases'),
              headers: _headers)
          .timeout(const Duration(seconds: 30));
      if (res.statusCode == 404 || res.statusCode == 401) {
        state = 'GitHub says no: add a fine-grained PAT in Settings '
            '(the repo is private).';
        return null;
      }
      if (res.statusCode != 200) {
        state = 'GitHub error ${res.statusCode}';
        return null;
      }
      final releases = (_jsonDecodeSafe(res.body) as List?) ?? [];
      Map<String, dynamic>? best;
      for (final r in releases.whereType<Map>()) {
        final tag = (r['tag_name'] ?? '').toString();
        if (tag.startsWith('apk-v')) {
          best = r.cast<String, dynamic>();
          break; // releases come newest-first
        }
      }
      if (best == null) {
        state = 'No APK releases published yet.';
        return null;
      }
      latestVersion = best['tag_name'].toString().substring(5);
      if (compareVersions(latestVersion!, installedVersion) <= 0) {
        state = 'Up to date (v$installedVersion).';
        return null;
      }
      state = 'v$latestVersion available.';
      _pendingRelease = best;
      return latestVersion;
    } catch (e) {
      state = 'Check failed: offline?';
      return null;
    } finally {
      busy = false;
      notifyListeners();
    }
  }

  Map<String, dynamic>? _pendingRelease;

  /// Download the APK asset of the pending release and launch the installer.
  Future<bool> downloadAndInstall() async {
    final release = _pendingRelease;
    if (release == null) return false;
    final assets = (release['assets'] as List? ?? []).whereType<Map>();
    Map<String, dynamic>? apkAsset;
    for (final a in assets) {
      if ((a['name'] ?? '').toString().endsWith('.apk')) {
        apkAsset = a.cast<String, dynamic>();
        break;
      }
    }
    if (apkAsset == null) {
      state = 'Release has no APK asset.';
      notifyListeners();
      return false;
    }
    busy = true;
    progress = 0;
    state = 'Downloading v$latestVersion…';
    notifyListeners();
    try {
      // Asset download from a private repo: request the asset id with
      // octet-stream accept and follow the redirect.
      final req = http.Request(
          'GET',
          Uri.parse(
              'https://api.github.com/repos/$_repo/releases/assets/${apkAsset['id']}'));
      req.headers.addAll({..._headers, 'Accept': 'application/octet-stream'});
      final res = await http.Client().send(req);
      if (res.statusCode >= 400) {
        state = 'Download failed (${res.statusCode}).';
        return false;
      }
      final total = res.contentLength ?? 0;
      final dir = await getApplicationCacheDirectory();
      final updates = Directory('${dir.path}/updates');
      if (!updates.existsSync()) updates.createSync(recursive: true);
      final file = File('${updates.path}/isconl-update.apk');
      final sink = file.openWrite();
      var received = 0;
      await for (final chunk in res.stream) {
        sink.add(chunk);
        received += chunk.length;
        if (total > 0) {
          progress = received / total;
          notifyListeners();
        }
      }
      await sink.close();
      state = 'Handing to installer…';
      notifyListeners();
      await PlatformBridge.instance.installApk(file.path);
      state = 'Installer launched.';
      return true;
    } catch (e) {
      state = 'Update failed: $e';
      return false;
    } finally {
      busy = false;
      notifyListeners();
    }
  }

  /// Semver-ish compare: positive when [a] is newer than [b].
  static int compareVersions(String a, String b) {
    List<int> parts(String v) => v
        .split('.')
        .map((x) => int.tryParse(x.replaceAll(RegExp(r'[^0-9]'), '')) ?? 0)
        .toList();
    final pa = parts(a), pb = parts(b);
    for (var idx = 0; idx < 3; idx++) {
      final da = idx < pa.length ? pa[idx] : 0;
      final db = idx < pb.length ? pb[idx] : 0;
      if (da != db) return da - db;
    }
    return 0;
  }
}

dynamic _jsonDecodeSafe(String body) {
  try {
    return jsonDecode(body);
  } catch (_) {
    return null;
  }
}
