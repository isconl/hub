import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:local_auth/local_auth.dart';

import 'app_scope.dart';
import 'services/alerts.dart';
import 'services/branding.dart';
import 'services/platform.dart';
import 'theme.dart';
import 'ui/login.dart';
import 'ui/shell.dart';
import 'ui/widgets/common.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(
    statusBarColor: Colors.transparent,
    statusBarIconBrightness: Brightness.light,
    systemNavigationBarColor: C.panel,
    systemNavigationBarIconBrightness: Brightness.light,
  ));
  PlatformBridge.instance.init();
  final services = await AppServices.boot();
  await BrandingService.instance.load();
  runApp(IsconlApp(services: services));
}

class IsconlApp extends StatelessWidget {
  const IsconlApp({super.key, required this.services});
  final AppServices services;

  @override
  Widget build(BuildContext context) {
    return AppScope(
      services: services,
      child: MaterialApp(
        title: 'iSconl',
        debugShowCheckedModeBanner: false,
        theme: buildTheme(),
        home: const RootGate(),
      ),
    );
  }
}

/// Decides what the user sees: biometric lock -> login -> shell.
class RootGate extends StatefulWidget {
  const RootGate({super.key});

  @override
  State<RootGate> createState() => _RootGateState();
}

class _RootGateState extends State<RootGate> {
  bool _unlocked = false;
  bool _authInFlight = false;
  String? _pendingShare;

  @override
  void initState() {
    super.initState();
    AlertService.instance.init();
    PlatformBridge.instance.onSharedText = _captureShare;
    PlatformBridge.instance.getSharedText().then((text) {
      if (text != null && text.trim().isNotEmpty) _captureShare(text);
    });
  }

  Future<void> _captureShare(String text) async {
    if (!mounted) return;
    final services = AppScope.of(context);
    if (!services.session.authenticated) {
      _pendingShare = text;
      return;
    }
    final res = await services.mutations.addInbox(
      body: text.trim(),
      channel: 'mobile',
      sender: 'share-sheet',
    );
    if (!mounted) return;
    toast(
      context,
      res.queued
          ? 'Captured to inbox - queued for sync'
          : res.ok
              ? 'Captured to inbox'
              : 'Capture failed: ${res.error}',
      error: !res.ok,
    );
  }

  Future<void> _tryUnlock() async {
    if (_authInFlight) return;
    _authInFlight = true;
    try {
      final auth = LocalAuthentication();
      final can =
          await auth.canCheckBiometrics || await auth.isDeviceSupported();
      if (!can) {
        setState(() => _unlocked = true);
        return;
      }
      final ok = await auth.authenticate(
        localizedReason: 'Unlock iSconl',
        options: const AuthenticationOptions(stickyAuth: true),
      );
      if (ok && mounted) setState(() => _unlocked = true);
    } catch (_) {
      // Sensor unavailable: fail open on the user's own device rather than
      // locking him out of his own brain. The vault token stays encrypted.
      if (mounted) setState(() => _unlocked = true);
    } finally {
      _authInFlight = false;
    }
  }

  @override
  Widget build(BuildContext context) {
    final services = AppScope.of(context);
    return ListenableBuilder(
      listenable: services.session,
      builder: (context, _) {
        final session = services.session;
        if (!session.ready) {
          return const Scaffold(body: Center(child: MiniSpinner(size: 22)));
        }
        if (!session.authenticated) {
          _unlocked = false;
          return LoginScreen(onAuthenticated: () {
            final share = _pendingShare;
            _pendingShare = null;
            if (share != null) _captureShare(share);
          });
        }
        if (session.biometricLock && !_unlocked) {
          return _LockScreen(onUnlock: _tryUnlock);
        }
        return const Shell();
      },
    );
  }
}

class _LockScreen extends StatefulWidget {
  const _LockScreen({required this.onUnlock});
  final Future<void> Function() onUnlock;

  @override
  State<_LockScreen> createState() => _LockScreenState();
}

class _LockScreenState extends State<_LockScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => widget.onUnlock());
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const BrandMark(size: 44),
            const SizedBox(height: 18),
            Text('Locked', style: T.title),
            const SizedBox(height: 6),
            Text('Biometric unlock required', style: T.small),
            const SizedBox(height: 22),
            OutlinedButton.icon(
              onPressed: widget.onUnlock,
              icon: const Icon(Icons.fingerprint_rounded, size: 18),
              label: const Text('Unlock'),
            ),
          ],
        ),
      ),
    );
  }
}

/// The brand mark: custom logo if set, else the favicon dot-triple.
class BrandMark extends StatelessWidget {
  const BrandMark({super.key, this.size = 26});
  final double size;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: BrandingService.instance,
      builder: (context, _) {
        final bytes = BrandingService.instance.logoBytes;
        if (bytes != null) {
          return ClipRRect(
            borderRadius: BorderRadius.circular(size * 0.25),
            child: Image.memory(bytes,
                width: size, height: size, fit: BoxFit.cover),
          );
        }
        return SizedBox(
          width: size,
          height: size,
          child: CustomPaint(painter: _FaviconPainter()),
        );
      },
    );
  }
}

class _FaviconPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final s = size.width / 64;
    final bgPaint = Paint()..color = C.bg;
    canvas.drawRRect(
      RRect.fromRectAndRadius(Offset.zero & size, Radius.circular(16 * s)),
      bgPaint,
    );
    final ring = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 4 * s
      ..color = C.surface;
    canvas.drawCircle(Offset(32 * s, 32 * s), 24 * s, ring);
    final arc = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 4 * s
      ..strokeCap = StrokeCap.round
      ..shader = const LinearGradient(colors: [C.green, C.greenDim])
          .createShader(Offset.zero & size);
    canvas.drawArc(
      Rect.fromCircle(center: Offset(32 * s, 32 * s), radius: 24 * s),
      -1.5708, // -90deg
      1.5708, // quarter sweep
      false,
      arc,
    );
    canvas.drawCircle(Offset(32 * s, 20 * s), 4 * s, Paint()..color = C.green);
    canvas.drawCircle(
        Offset(32 * s, 32 * s), 6 * s, Paint()..color = C.greenBright);
    canvas.drawCircle(
        Offset(32 * s, 44 * s), 4 * s, Paint()..color = C.greenDim);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
