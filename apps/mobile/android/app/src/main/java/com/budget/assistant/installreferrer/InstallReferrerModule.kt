package com.budget.assistant.installreferrer

import android.os.RemoteException
import com.android.installreferrer.api.InstallReferrerClient
import com.android.installreferrer.api.InstallReferrerStateListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Bridge over the Play Install Referrer API.
 *
 * Legacy Old-Arch NativeModule on purpose — no TurboModule spec, no codegen
 * (Windows MAX_PATH constraint, same reason as NotificationCaptureModule and
 * RestoreCredentialModule).
 *
 * The promise ALWAYS resolves and never rejects. `null` means "no referrer
 * available", which is the ordinary outcome on a sideloaded build, on a device
 * without Play Services, and on any install that did not come from Play. A
 * rejection here would turn an expected absence into an error the JS side has to
 * special-case, and attribution must never be able to break anything.
 */
class InstallReferrerModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "InstallReferrerModule"

    @ReactMethod
    fun getInstallReferrer(promise: Promise) {
        // The listener can fire twice — a disconnect can arrive alongside or after
        // the setup callback — and settling a Promise twice is a hard error in RN.
        val settled = AtomicBoolean(false)

        fun finish(value: String?, client: InstallReferrerClient?) {
            if (!settled.compareAndSet(false, true)) return
            try {
                client?.endConnection()
            } catch (_: Throwable) {
                // Closing a connection that never opened is not a failure worth reporting.
            }
            promise.resolve(value)
        }

        try {
            // Constructed inside the guarded region on purpose: .build() itself can
            // throw (e.g. NoClassDefFoundError/ExceptionInInitializerError from the
            // AAR), and that must resolve null like every other failure path here,
            // not escape getInstallReferrer and leave the promise unsettled.
            val client = InstallReferrerClient.newBuilder(reactContext).build()
            client.startConnection(object : InstallReferrerStateListener {
                override fun onInstallReferrerSetupFinished(responseCode: Int) {
                    if (responseCode != InstallReferrerClient.InstallReferrerResponse.OK) {
                        // FEATURE_NOT_SUPPORTED, SERVICE_UNAVAILABLE, DEVELOPER_ERROR.
                        finish(null, client)
                        return
                    }
                    val referrer = try {
                        client.installReferrer.installReferrer
                    } catch (_: RemoteException) {
                        null
                    } catch (_: Throwable) {
                        null
                    }
                    finish(referrer, client)
                }

                override fun onInstallReferrerServiceDisconnected() {
                    // Only reached if the service drops before the setup callback ran;
                    // the settled flag makes a late arrival a no-op.
                    finish(null, client)
                }
            })
        } catch (_: Throwable) {
            // Covers both a synchronous failure from .build() (no client was ever
            // constructed, so there is nothing to close — finish() tolerates a null
            // client for exactly this) and one from startConnection() itself; either
            // way this must not race an already-scheduled callback into
            // double-settling the promise — the settled flag covers that too.
            finish(null, null)
        }
    }
}
