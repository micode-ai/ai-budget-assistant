package com.budget.assistant.notifications

import android.content.Context
import android.os.Bundle
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactContext
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * Legacy Old-Arch NotificationListenerService that forwards bank push notifications to JS via
 * DeviceEventEmitter. Registered in AndroidManifest.xml; NOT a TurboModule — avoids the
 * Windows MAX_PATH / Fabric codegen issue that broke keyboard-controller (CLAUDE.md constraint).
 *
 * Security model:
 *  - Allow-list of known PL bank package names checked as the VERY FIRST step in
 *    onNotificationPosted. All other packages are dropped immediately (battery / privacy).
 *  - No native parsing: raw text forwarded to JS where merchants-pl.ts runs on-device.
 *  - Entire notification text never leaves the device; only the parsed expense syncs.
 *  - Feature-gate: SharedPreferences key "notif_capture_enabled" must be true before any
 *    event is forwarded.
 *
 * CRITICAL: NEVER throw out of onNotificationPosted. The app has no crash reporting (CLAUDE.md).
 * All logic is wrapped in try/catch — a misbehaving listener is silent via Play Console vitals.
 */
class BankNotificationListenerService : NotificationListenerService() {

    companion object {
        const val PREFS_NAME = "NotificationCapturePrefs"
        const val KEY_ENABLED = "notif_capture_enabled"
        const val EVENT_NAME = "onBankNotification"

        /**
         * Allow-list of Polish and international bank app package names.
         * Only these packages are forwarded; all others are silently dropped.
         * Must be kept minimal and accurate to limit the surface area of what this
         * service processes (battery, privacy, security audit requirement §7).
         */
        val BANK_PACKAGES: Set<String> = setOf(
            // PKO BP
            "pl.pkobp.iko",
            // mBank
            "pl.mbank",
            // Bank Pekao
            "eu.eleader.mobilebanking.pekao",
            // Revolut
            "com.revolut.revolut",
            // ING Bank Śląski
            "pl.ing.mojeing",
            // Millennium Bank
            "wit.android.bcpBankingApp.millenniumPL",
            // Santander Bank Polska
            "pl.bzwbk.bzwbk24",
            // Alior Bank
            "pl.aliorbank.aib",
            // BNP Paribas
            "com.finanteq.finance.bgz",
            // Credit Agricole
            "pl.ca.mobile",
            // Nest Bank
            "pl.nestbank.nestbank",
            // Toyota Bank (Investio)
            "pl.toyota.bank",
        )

        /** Emit a DeviceEventEmitter event to JS. Called from this service. */
        fun emitEvent(reactContext: ReactContext?, packageName: String, title: String, text: String, postedAt: Long) {
            reactContext ?: return
            if (!reactContext.hasActiveReactInstance()) return
            try {
                val params = Arguments.createMap().apply {
                    putString("packageName", packageName)
                    putString("title", title)
                    putString("text", text)
                    putDouble("postedAt", postedAt.toDouble())
                }
                reactContext
                    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                    .emit(EVENT_NAME, params)
            } catch (_: Exception) {
                // DeviceEventEmitter failure is non-fatal; log nothing (no crash reporting)
            }
        }
    }

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        // Never throw: wrap entire body (CLAUDE.md + spec §7)
        try {
            if (sbn == null) return

            // Step 1 — allow-list check is the VERY FIRST operation (battery/privacy)
            val packageName = sbn.packageName ?: return
            if (packageName !in BANK_PACKAGES) return

            // Step 2 — feature-gate: user must have enabled capture
            val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            if (!prefs.getBoolean(KEY_ENABLED, false)) return

            // Step 3 — extract notification text
            val extras: Bundle = sbn.notification?.extras ?: return
            val title = extras.getCharSequence("android.title")?.toString() ?: ""
            // Prefer bigText (expanded notification body) over plain text
            val text = (extras.getCharSequence("android.bigText")
                ?: extras.getCharSequence("android.text"))?.toString() ?: ""

            // Skip empty notifications
            if (title.isEmpty() && text.isEmpty()) return

            // Step 4 — forward to JS via DeviceEventEmitter
            val reactContext = NotificationCaptureModule.getReactContext()
            emitEvent(reactContext, packageName, title, text, sbn.postTime)
        } catch (_: Exception) {
            // Intentionally swallow all exceptions — no crash reporting on mobile
        }
    }

    override fun onNotificationRemoved(sbn: StatusBarNotification?) {
        // Not needed; no-op
    }
}
