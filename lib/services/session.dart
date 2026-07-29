import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../api/client.dart';

/// Auth + connection state. Tokens live in Android EncryptedSharedPreferences
/// via flutter_secure_storage - never in plain prefs.
class SessionService extends ChangeNotifier {
  SessionService();

  static const _storage = FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
  );
  static const defaultServer = 'https://isconl-agent.onrender.com';

  late final ApiClient api =
      ApiClient(baseUrl: defaultServer)..onAuthFailure = _onAuthFailure;

  bool ready = false; // storage loaded
  bool authenticated = false;
  bool biometricLock = false;
  String serverUrl = defaultServer;
  String ghPat = ''; // optional, for update checks against the private repo
  Map<String, dynamic>? serverHealth;

  Future<void> load() async {
    serverUrl = await _storage.read(key: 'serverUrl') ?? defaultServer;
    final token = await _storage.read(key: 'token') ?? '';
    ghPat = await _storage.read(key: 'ghPat') ?? '';
    biometricLock = (await _storage.read(key: 'bioLock')) == '1';
    api.baseUrl = serverUrl;
    api.token = token;
    authenticated = token.isNotEmpty;
    ready = true;
    notifyListeners();
  }

  void _onAuthFailure() {
    // Static tokens stay valid; only TOTP session tokens expire. Either way
    // the server said 404 on a core route: force re-login.
    if (!authenticated) return;
    authenticated = false;
    notifyListeners();
  }

  Future<void> setServer(String url) async {
    serverUrl = url.trim().isEmpty ? defaultServer : url.trim();
    api.baseUrl = serverUrl;
    await _storage.write(key: 'serverUrl', value: serverUrl);
    notifyListeners();
  }

  Future<void> setGhPat(String pat) async {
    ghPat = pat.trim();
    await _storage.write(key: 'ghPat', value: ghPat);
    notifyListeners();
  }

  Future<void> setBiometricLock(bool enabled) async {
    biometricLock = enabled;
    await _storage.write(key: 'bioLock', value: enabled ? '1' : '0');
    notifyListeners();
  }

  /// Which login methods the server offers.
  Future<Map<String, dynamic>> authMethods() async {
    final res = await api.getJson('/api/auth/methods', cold: true);
    return res is Map ? res.cast<String, dynamic>() : {};
  }

  /// Exchange a 6-digit TOTP code for a 12h session token.
  Future<String?> loginTotp(String code) async {
    try {
      final res = await api.postJson('/api/auth/totp', {'code': code}, cold: true);
      final map = res is Map ? res.cast<String, dynamic>() : <String, dynamic>{};
      if (map['success'] == true && map['token'] is String) {
        await _adopt(map['token'] as String);
        return null;
      }
      return (map['error'] as String?) ?? 'Invalid or expired code';
    } on ApiException catch (e) {
      return e.message;
    } on OfflineException {
      return 'No connection - check network or server URL';
    }
  }

  /// Use the static dashboard token directly.
  Future<String?> loginToken(String token) async {
    final previous = api.token;
    api.token = token.trim();
    try {
      await api.getJson('/api/state', cold: true);
      await _adopt(token.trim());
      return null;
    } on ApiException {
      api.token = previous;
      return 'Token rejected';
    } on OfflineException {
      api.token = previous;
      return 'No connection - check network or server URL';
    }
  }

  Future<void> _adopt(String token) async {
    api.token = token;
    await _storage.write(key: 'token', value: token);
    authenticated = true;
    notifyListeners();
  }

  Future<void> logout() async {
    try {
      await api.postJson('/api/auth/logout', {});
    } catch (_) {}
    api.token = '';
    await _storage.delete(key: 'token');
    authenticated = false;
    notifyListeners();
  }

  Future<void> probeHealth() async {
    serverHealth = await api.health();
    notifyListeners();
  }
}
