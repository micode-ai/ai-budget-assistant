package com.budget.assistant.share

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.OpenableColumns
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import java.io.File
import java.util.concurrent.Executors

/**
 * Receives ACTION_SEND / ACTION_SEND_MULTIPLE (images + PDF) for share-to-capture.
 *
 * Legacy Old-Arch NativeModule on purpose — no TurboModule spec, no codegen
 * (Windows MAX_PATH constraint, same as InstallReferrerModule).
 *
 * The read grant on a foreign content:// URI is temporary, so every stream is
 * copied into cacheDir/shared-intake/ immediately and JS only ever sees file://
 * URIs. A share that arrives before JS is listening (cold start) is held in
 * [pending] until getInitialShare() consumes it; a warm share is emitted with
 * emitDeviceEvent (getJSModule().emit() is swallowed under New Architecture).
 * Nothing here throws into the Activity: a share that cannot be read is counted
 * as dropped.
 */
class ShareIntakeModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "ShareIntakeModule"

    init {
        instance = this
    }

    override fun invalidate() {
        if (instance === this) {
            instance = null
            // A reload re-runs the bundle; the new JS must ask again before we emit.
            synchronized(lock) { jsReady = false }
        }
        super.invalidate()
    }

    /**
     * Also marks JS as listening: the module (and [instance]) exists from bundle
     * evaluation, well before the root hook subscribes, so until JS has called
     * this once every payload is held rather than emitted into the void.
     */
    @ReactMethod
    fun getInitialShare(promise: Promise) {
        val held = synchronized(lock) {
            jsReady = true
            val out = pending?.let { toWritable(it) }
            pending = null
            out
        }
        promise.resolve(held)
    }

    @ReactMethod
    fun deleteFile(uri: String, promise: Promise) {
        try {
            val path = Uri.parse(uri).path
            val file = if (path != null) File(path) else null
            val dir = intakeDir(reactContext).canonicalPath
            // Only ever delete inside our own intake folder.
            val ok = file != null && file.canonicalPath.startsWith(dir) && file.delete()
            promise.resolve(ok)
        } catch (_: Throwable) {
            promise.resolve(false)
        }
    }

    @ReactMethod
    fun purgeStale(maxAgeMs: Double, promise: Promise) {
        try {
            val cutoff = System.currentTimeMillis() - maxAgeMs.toLong()
            var removed = 0
            intakeDir(reactContext).listFiles()?.forEach {
                if (it.lastModified() < cutoff && it.delete()) removed++
            }
            promise.resolve(removed)
        } catch (_: Throwable) {
            promise.resolve(0)
        }
    }

    override fun getConstants(): MutableMap<String, Any> = mutableMapOf(
        "MAX_FILES" to MAX_FILES,
        "MAX_PDF_BYTES" to MAX_PDF_BYTES.toDouble(),
        "MAX_IMAGE_BYTES" to MAX_IMAGE_BYTES.toDouble(),
    )

    companion object {
        const val EVENT_NAME = "ShareIntakeReceived"
        const val MAX_FILES = 10
        const val MAX_PDF_BYTES = 10L * 1024 * 1024
        const val MAX_IMAGE_BYTES = 25L * 1024 * 1024

        private val lock = Any()
        /** Held until JS reads it; several shares before that are merged, never overwritten. */
        private var pending: Held? = null
        private var jsReady = false
        @Volatile private var instance: ShareIntakeModule? = null
        private val io = Executors.newSingleThreadExecutor()

        private class Held(val files: MutableList<Map<String, Any>>, var dropped: Int)

        private fun toWritable(h: Held): WritableMap = Arguments.createMap().apply {
            val arr = Arguments.createArray()
            h.files.forEach { f ->
                arr.pushMap(Arguments.createMap().apply {
                    putString("uri", f["uri"] as String)
                    putString("mimeType", f["mimeType"] as String)
                    putString("name", f["name"] as String)
                    putDouble("size", f["size"] as Double)
                })
            }
            putArray("files", arr)
            putInt("droppedCount", h.dropped)
        }

        private fun intakeDir(ctx: Context): File =
            File(ctx.cacheDir, "shared-intake").apply { mkdirs() }

        /** Called by MainActivity from onCreate and onNewIntent. Never throws. */
        fun handleIntent(activity: Activity, intent: Intent?) {
            try {
                if (intent == null) return
                val action = intent.action
                if (action != Intent.ACTION_SEND && action != Intent.ACTION_SEND_MULTIPLE) return
                val uris = extractUris(intent)
                val intentType = intent.type
                // Consume the intent so a config change / recreate does not re-deliver it.
                intent.action = null
                if (uris.isEmpty()) return
                val appContext = activity.applicationContext
                io.execute { deliver(copyAll(appContext, uris, intentType)) }
            } catch (_: Throwable) {
                // A share must never be able to crash the launch.
            }
        }

        /**
         * Only another app's content:// stream is accepted. A file:// URI (or one
         * of our own providers) could point at this app's private storage and get
         * it uploaded for OCR.
         */
        private fun isForeignContent(ctx: Context, uri: Uri): Boolean =
            uri.scheme == "content" && uri.authority?.startsWith(ctx.packageName) != true

        @Suppress("DEPRECATION")
        private fun extractUris(intent: Intent): List<Uri> = try {
            if (intent.action == Intent.ACTION_SEND) {
                val u: Uri? = if (Build.VERSION.SDK_INT >= 34)
                    intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)
                else intent.getParcelableExtra(Intent.EXTRA_STREAM)
                listOfNotNull(u)
            } else {
                val list: ArrayList<Uri>? = if (Build.VERSION.SDK_INT >= 34)
                    intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri::class.java)
                else intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM)
                list?.toList() ?: emptyList()
            }
        } catch (_: Throwable) {
            emptyList()
        }

        private fun imageExtension(mime: String): String {
            val sub = mime.substringAfter("image/", "")
            return if (sub.matches(Regex("[a-z0-9]{2,5}"))) sub else "jpg"
        }

        private fun copyAll(ctx: Context, uris: List<Uri>, intentType: String?): Held {
            val files = mutableListOf<Map<String, Any>>()
            var dropped = 0
            uris.forEachIndexed { i, uri ->
                if (i >= MAX_FILES) { dropped++; return@forEachIndexed }
                if (!isForeignContent(ctx, uri)) { dropped++; return@forEachIndexed }
                try {
                    val resolver = ctx.contentResolver
                    val mime = resolver.getType(uri) ?: intentType ?: ""
                    val name = queryName(ctx, uri) ?: "shared-$i"
                    val isPdf = mime == "application/pdf" || name.endsWith(".pdf", ignoreCase = true)
                    if (!isPdf && !mime.startsWith("image/")) { dropped++; return@forEachIndexed }
                    val limit = if (isPdf) MAX_PDF_BYTES else MAX_IMAGE_BYTES
                    val ext = if (isPdf) "pdf" else imageExtension(mime)
                    val out = File(intakeDir(ctx), "${System.currentTimeMillis()}-$i.$ext")
                    var size = 0L
                    var tooBig = false
                    val input = resolver.openInputStream(uri)
                    if (input == null) { dropped++; return@forEachIndexed }
                    input.use { stream ->
                        out.outputStream().use { output ->
                            val buf = ByteArray(64 * 1024)
                            while (true) {
                                val n = stream.read(buf)
                                if (n < 0) break
                                size += n
                                if (size > limit) { tooBig = true; break }
                                output.write(buf, 0, n)
                            }
                        }
                    }
                    if (tooBig || size == 0L) { out.delete(); dropped++; return@forEachIndexed }
                    files.add(mapOf(
                        "uri" to Uri.fromFile(out).toString(),
                        "mimeType" to (if (isPdf) "application/pdf" else mime),
                        "name" to name,
                        "size" to size.toDouble(),
                    ))
                } catch (_: Throwable) {
                    dropped++
                }
            }
            return Held(files, dropped)
        }

        private fun queryName(ctx: Context, uri: Uri): String? = try {
            ctx.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use {
                if (it.moveToFirst()) it.getString(0) else null
            }
        } catch (_: Throwable) {
            null
        }

        private fun deliver(payload: Held) {
            synchronized(lock) {
                val ctx = instance?.reactContext
                if (jsReady && pending == null && ctx != null && ctx.hasActiveReactInstance()) {
                    try {
                        ctx.emitDeviceEvent(EVENT_NAME, toWritable(payload))
                        return
                    } catch (_: Throwable) {
                        // Fall through and hold it for getInitialShare().
                    }
                }
                val held = pending
                if (held == null) {
                    pending = payload
                } else {
                    held.files.addAll(payload.files)
                    held.dropped += payload.dropped
                }
            }
        }
    }
}
