package com.sconl.isconl

import android.app.Activity
import android.content.Intent
import android.net.Uri
import androidx.core.content.FileProvider
import io.flutter.embedding.android.FlutterFragmentActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import java.io.File

// FlutterFragmentActivity (not FlutterActivity) so local_auth's biometric
// prompt, which requires a FragmentActivity host, works.
class MainActivity : FlutterFragmentActivity() {
    private val channelName = "isconl/platform"
    private var pendingSharedText: String? = null
    private var pickResult: MethodChannel.Result? = null
    private val pickRequestCode = 7301

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        pendingSharedText = extractSharedText(intent)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, channelName).setMethodCallHandler { call, result ->
            when (call.method) {
                "getSharedText" -> {
                    result.success(pendingSharedText)
                    pendingSharedText = null
                }
                "installApk" -> {
                    val path = call.argument<String>("path")
                    if (path == null) {
                        result.error("ARG", "path required", null)
                    } else {
                        try {
                            installApk(File(path))
                            result.success(true)
                        } catch (e: Exception) {
                            result.error("INSTALL", e.message, null)
                        }
                    }
                }
                "pickImage" -> {
                    if (pickResult != null) {
                        result.error("BUSY", "picker already open", null)
                    } else {
                        pickResult = result
                        val pick = Intent(Intent.ACTION_GET_CONTENT).apply {
                            type = "image/*"
                            addCategory(Intent.CATEGORY_OPENABLE)
                        }
                        try {
                            startActivityForResult(Intent.createChooser(pick, "Choose image"), pickRequestCode)
                        } catch (e: Exception) {
                            pickResult = null
                            result.error("PICK", e.message, null)
                        }
                    }
                }
                else -> result.notImplemented()
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        val shared = extractSharedText(intent)
        if (shared != null) {
            pendingSharedText = shared
            flutterEngine?.dartExecutor?.binaryMessenger?.let {
                MethodChannel(it, channelName).invokeMethod("sharedText", shared)
            }
        }
    }

    private fun extractSharedText(intent: Intent?): String? {
        if (intent?.action == Intent.ACTION_SEND && intent.type == "text/plain") {
            val text = intent.getStringExtra(Intent.EXTRA_TEXT)
            val subject = intent.getStringExtra(Intent.EXTRA_SUBJECT)
            return when {
                text == null -> subject
                subject != null && !text.contains(subject) -> "$subject\n$text"
                else -> text
            }
        }
        return null
    }

    private fun installApk(file: File) {
        val uri: Uri = FileProvider.getUriForFile(this, "$packageName.fileprovider", file)
        val install = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        startActivity(install)
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode == pickRequestCode) {
            val result = pickResult
            pickResult = null
            if (result == null) return
            if (resultCode == Activity.RESULT_OK && data?.data != null) {
                try {
                    contentResolver.openInputStream(data.data!!).use { input ->
                        result.success(input?.readBytes())
                    }
                } catch (e: Exception) {
                    result.error("READ", e.message, null)
                }
            } else {
                result.success(null)
            }
            return
        }
        @Suppress("DEPRECATION")
        super.onActivityResult(requestCode, resultCode, data)
    }
}
