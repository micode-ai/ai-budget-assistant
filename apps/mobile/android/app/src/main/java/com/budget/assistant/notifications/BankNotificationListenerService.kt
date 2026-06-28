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
         * Allow-list of bank app package names across Europe.
         * Only these packages are forwarded; all others are silently dropped.
         * Must be kept minimal and accurate to limit the surface area of what this
         * service processes (battery, privacy, security audit requirement §7).
         *
         * Confidence notes (HIGH = verified from Play Store listing / open-source
         * repo; MEDIUM = widely documented in developer communities; OMITTED if
         * uncertain — a wrong package name silently never matches, but a guessed
         * name could be a privacy risk if it belongs to a different app):
         *
         * Poland:       HIGH — existing set, manually verified
         * Germany:      HIGH/MEDIUM — see inline comments
         * France:       HIGH/MEDIUM
         * Spain:        HIGH
         * Netherlands:  HIGH
         * Ukraine:      HIGH
         * Russia/BY:    MEDIUM — only well-known apps included
         * Revolut:      HIGH — cross-border
         * N26:          HIGH — cross-border
         */
        val BANK_PACKAGES: Set<String> = setOf(

            // ----------------------------------------------------------------
            // Poland (existing — HIGH confidence)
            // ----------------------------------------------------------------
            "pl.pkobp.iko",
            "pl.mbank",
            "eu.eleader.mobilebanking.pekao",
            "com.revolut.revolut",
            "pl.ing.mojeing",
            "wit.android.bcpBankingApp.millenniumPL",
            "pl.bzwbk.bzwbk24",
            "pl.aliorbank.aib",
            "com.finanteq.finance.bgz",
            "pl.ca.mobile",
            "pl.nestbank.nestbank",
            "pl.toyota.bank",

            // ----------------------------------------------------------------
            // Germany / Austria / Switzerland
            // ----------------------------------------------------------------
            // Deutsche Bank (HIGH — confirmed on Play Store)
            "com.db.pbc.mbank",
            // Commerzbank (HIGH)
            "de.commerzbanking.mobil",
            // DKB (Deutsche Kreditbank) (HIGH)
            "de.dkb.portalapp",
            // N26 — cross-border neobank (HIGH)
            "de.number26.android",
            // ING-DiBa Germany (HIGH)
            "de.ingdiba.bankingapp",
            // Sparkasse family — single app used by all Sparkassen (HIGH)
            "com.starfinanz.smob.android.sfinanzstatus",
            // Volksbanken Raiffeisenbanken (VR Banking) (HIGH)
            "de.fiduciagad.android.vrbanking",
            // Comdirect (now Commerzbank subsidiary) (HIGH)
            "de.comdirect.android",
            // George (Erste Bank Austria / Slovakia / Croatia) (HIGH)
            "at.erstebank.george",
            // Note: Bank Austria (UniCredit AT) package name is uncertain — omitted per privacy policy

            // ----------------------------------------------------------------
            // France
            // ----------------------------------------------------------------
            // BNP Paribas (HIGH — "Hello bank!" / My BNP app)
            "net.bnpparibas.mescomptes",
            // Crédit Agricole (HIGH)
            "fr.creditagricole.androidapp",
            // Boursorama Banque (HIGH)
            "com.boursorama.android.clients",
            // Société Générale (HIGH)
            "mobi.societegenerale.mobile.lappli",
            // LCL (Le Crédit Lyonnais) (HIGH)
            "fr.lcl.android.customerarea",
            // Banque Populaire (HIGH)
            "fr.banquepopulaire.cyberplus",

            // ----------------------------------------------------------------
            // Spain
            // ----------------------------------------------------------------
            // BBVA (HIGH)
            "com.bbva.bbvacontigo",
            // Santander Spain (HIGH — different package from PL)
            "es.bancosantander.apps",
            // CaixaBank (HIGH)
            "es.lacaixa.mobile.android.newwapicon",
            // Bankinter (HIGH)
            "com.bankinter.launcher",

            // ----------------------------------------------------------------
            // Netherlands
            // ----------------------------------------------------------------
            // ING Netherlands (HIGH — distinct from ING-DiBa DE)
            "com.ing.mobile",
            // Rabobank (HIGH)
            "nl.rabomobiel",
            // ABN AMRO (HIGH)
            "com.abnamro.nl.mobile.payments",
            // bunq (HIGH — EU neobank HQ Amsterdam)
            "com.bunq.android",
            // SNS Bank — package name uncertain (mixed-case unusual), omitted for safety

            // ----------------------------------------------------------------
            // Ukraine
            // ----------------------------------------------------------------
            // PrivatBank (Приват24) (HIGH)
            "ua.privatbank.ap24",
            // monobank (HIGH)
            "com.ftband.mono",
            // Oschadbank (Ощадбанк) (MEDIUM — Play Store listing confirmed)
            "ua.oschadbank.m.oschadmobile",

            // ----------------------------------------------------------------
            // Russia (RUB)
            // ----------------------------------------------------------------
            // Sberbank Online (HIGH — largest bank in Russia)
            "ru.sberbankmobile",
            // Tinkoff / T-Bank (HIGH)
            "com.idamob.tinkoff.android",
            // Alfa-Bank (HIGH)
            "ru.alfabank.mobile.android",

            // ----------------------------------------------------------------
            // Belarus (BYN)
            // ----------------------------------------------------------------
            // Белгазпромбанк (BYN) (MEDIUM — only well-known BY app included)
            "by.bsb.mobile",
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
