package com.budget.assistant.notifications

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.provider.Settings
import android.text.TextUtils
import androidx.core.app.NotificationManagerCompat
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * Legacy (Old-Arch) NativeModule — no TurboModule spec, no codegen.
 * Exposes three JS-callable methods and provides the static ReactContext
 * reference that BankNotificationListenerService uses to emit events.
 *
 * Registered in MainApplication.kt via NotificationCapturePackage.
 * This approach avoids the Windows MAX_PATH / Fabric codegen paths that broke
 * the keyboard-controller module (CLAUDE.md build constraint).
 */
class NotificationCaptureModule(private val reactContext: ReactApplicationContext)
    : ReactContextBaseJavaModule(reactContext) {

    companion object {
        @Volatile private var instance: NotificationCaptureModule? = null

        /**
         * Returns the live ReactApplicationContext for DeviceEventEmitter use in the
         * NotificationListenerService. Nullable — service may fire before JS bridge is ready.
         */
        fun getReactContext(): ReactApplicationContext? = instance?.reactContext
    }

    init {
        instance = this
        // Flush any notification that arrived before the JS bridge was ready.
        // runOnJSQueueThread guarantees we emit after the DeviceEventEmitter
        // subscriber in JS has been registered.
        BankNotificationListenerService.pendingEvent?.let { params ->
            BankNotificationListenerService.pendingEvent = null
            reactContext.runOnJSQueueThread {
                try { reactContext.emitDeviceEvent(BankNotificationListenerService.EVENT_NAME, params) }
                catch (_: Exception) {}
            }
        }
    }

    override fun getName(): String = "NotificationCaptureModule"

    /**
     * Check whether the notification listener permission is granted for this app.
     * Uses the Settings.Secure string (reliable across Android 5+).
     */
    @ReactMethod
    fun isPermissionGranted(promise: Promise) {
        try {
            val enabledListeners = Settings.Secure.getString(
                reactContext.contentResolver,
                "enabled_notification_listeners"
            )
            val componentName = ComponentName(reactContext, BankNotificationListenerService::class.java)
            val isGranted = !enabledListeners.isNullOrEmpty() &&
                enabledListeners.contains(componentName.flattenToString())
            promise.resolve(isGranted)
        } catch (e: Exception) {
            // Fallback via NotificationManagerCompat if Settings.Secure fails
            try {
                val packages = NotificationManagerCompat.getEnabledListenerPackages(reactContext)
                promise.resolve(reactContext.packageName in packages)
            } catch (e2: Exception) {
                promise.resolve(false)
            }
        }
    }

    /**
     * Open the OS Notification Listener Settings screen so the user can grant permission.
     * Always resolves (no return value needed).
     */
    @ReactMethod
    fun openPermissionSettings(promise: Promise) {
        try {
            val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
            }
            reactContext.startActivity(intent)
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("OPEN_SETTINGS_FAILED", "Could not open notification settings: ${e.message}")
        }
    }

    /**
     * Gate whether the service actually forwards events to JS.
     * Persisted in SharedPreferences so it survives process restart.
     * The service reads this flag as its first step in onNotificationPosted.
     */
    @ReactMethod
    fun setEnabled(enabled: Boolean, promise: Promise) {
        try {
            val prefs = reactContext.getSharedPreferences(
                BankNotificationListenerService.PREFS_NAME,
                Context.MODE_PRIVATE
            )
            prefs.edit().putBoolean(BankNotificationListenerService.KEY_ENABLED, enabled).apply()
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("SET_ENABLED_FAILED", "Could not persist enabled state: ${e.message}")
        }
    }

    /**
     * Read the current enabled flag (useful for restoring toggle state on app restart).
     */
    @ReactMethod
    fun isEnabled(promise: Promise) {
        try {
            val prefs = reactContext.getSharedPreferences(
                BankNotificationListenerService.PREFS_NAME,
                Context.MODE_PRIVATE
            )
            promise.resolve(prefs.getBoolean(BankNotificationListenerService.KEY_ENABLED, false))
        } catch (e: Exception) {
            promise.resolve(false)
        }
    }
}
