package com.budget.assistant.restorecredentials

import android.os.CancellationSignal
import androidx.credentials.ClearCredentialStateRequest
import androidx.credentials.CreateCredentialResponse
import androidx.credentials.CreateRestoreCredentialRequest
import androidx.credentials.CreateRestoreCredentialResponse
import androidx.credentials.CredentialManager
import androidx.credentials.CredentialManagerCallback
import androidx.credentials.GetCredentialRequest
import androidx.credentials.GetCredentialResponse
import androidx.credentials.GetRestoreCredentialOption
import androidx.credentials.RestoreCredential
import androidx.credentials.exceptions.ClearCredentialException
import androidx.credentials.exceptions.CreateCredentialException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.restorecredential.E2eeUnavailableException
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.util.concurrent.Executor

/**
 * Bridge over androidx.credentials for Android Restore Credentials.
 *
 * Legacy Old-Arch NativeModule on purpose — no TurboModule spec, no codegen
 * (Windows MAX_PATH constraint, same reason as NotificationCaptureModule).
 *
 * Uses the callback (*Async) Credential Manager APIs rather than the suspend
 * ones: a Promise is already a callback, and the suspend variants would make
 * this module own a coroutine scope tied to an Activity lifecycle for no gain.
 */
class RestoreCredentialModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "RestoreCredentialModule"

    // Runs each CredentialManagerCallback inline, on whatever thread the
    // platform invokes it on -- deliberately not ContextCompat.getMainExecutor()
    // as Google's samples use. Every callback body below only does a type cast
    // plus promise.resolve/reject, both thread-safe; there is no UI work here,
    // so a main-thread hop would buy nothing.
    private val executor: Executor = Executor { command -> command.run() }

    private fun credentialManager(): CredentialManager =
        CredentialManager.create(reactContext)

    @ReactMethod
    fun createCredential(requestJson: String, promise: Promise) {
        createWith(requestJson, cloudBackup = true, promise = promise, allowRetry = true)
    }

    private fun createWith(
        requestJson: String,
        cloudBackup: Boolean,
        promise: Promise,
        allowRetry: Boolean,
    ) {
        val activity = reactContext.currentActivity ?: run {
            promise.reject("no_activity", "No current activity")
            return
        }
        try {
            val request = CreateRestoreCredentialRequest(requestJson, isCloudBackupEnabled = cloudBackup)
            credentialManager().createCredentialAsync(
                activity,
                request,
                CancellationSignal(),
                executor,
                object : CredentialManagerCallback<CreateCredentialResponse, CreateCredentialException> {
                    override fun onResult(result: CreateCredentialResponse) {
                        val json = (result as? CreateRestoreCredentialResponse)?.responseJson
                        if (json == null) {
                            promise.reject("unexpected_response", "Not a restore credential response")
                        } else {
                            promise.resolve(json)
                        }
                    }

                    override fun onError(e: CreateCredentialException) {
                        // A device with no screen lock or no Google backup cannot hold a
                        // cloud-backed restore key. Retrying locally still produces a key
                        // that survives a device-to-device cable transfer, so this is worth
                        // one retry rather than leaving those users with nothing.
                        if (allowRetry && isE2eeUnavailable(e)) {
                            createWith(requestJson, cloudBackup = false, promise = promise, allowRetry = false)
                        } else {
                            promise.reject(e.type ?: "create_failed", e.errorMessage?.toString() ?: e.message)
                        }
                    }
                },
            )
        } catch (e: Exception) {
            // A malformed requestJson (or any other synchronous construction/dispatch
            // failure) throws here, before createCredentialAsync has scheduled any
            // callback -- so this can never race a callback that has already settled
            // the Promise. Distinct code from "create_failed" so JS can tell a bad
            // request apart from a real platform failure.
            promise.reject("request_invalid", e.message)
        }
    }

    private fun isE2eeUnavailable(e: CreateCredentialException): Boolean = e is E2eeUnavailableException

    @ReactMethod
    fun getCredential(requestJson: String, promise: Promise) {
        val activity = reactContext.currentActivity ?: run {
            promise.reject("no_activity", "No current activity")
            return
        }
        try {
            val request = GetCredentialRequest(listOf(GetRestoreCredentialOption(requestJson)))
            credentialManager().getCredentialAsync(
                activity,
                request,
                CancellationSignal(),
                executor,
                object : CredentialManagerCallback<GetCredentialResponse, GetCredentialException> {
                    override fun onResult(result: GetCredentialResponse) {
                        val credential = result.credential as? RestoreCredential
                        if (credential == null) {
                            promise.reject("unexpected_credential", "Not a restore credential")
                        } else {
                            promise.resolve(credential.authenticationResponseJson)
                        }
                    }

                    override fun onError(e: GetCredentialException) {
                        // "No credential available" is the ordinary case on a device that
                        // was never restored. The JS layer treats every rejection the same.
                        promise.reject(e.type ?: "get_failed", e.errorMessage?.toString() ?: e.message)
                    }
                },
            )
        } catch (e: Exception) {
            // Same reasoning as createWith: this can only fire before any callback
            // has been scheduled, so it cannot race a settled Promise.
            promise.reject("request_invalid", e.message)
        }
    }

    @ReactMethod
    fun clearCredential(promise: Promise) {
        try {
            credentialManager().clearCredentialStateAsync(
                ClearCredentialStateRequest(ClearCredentialStateRequest.TYPE_CLEAR_RESTORE_CREDENTIAL),
                CancellationSignal(),
                executor,
                object : CredentialManagerCallback<Void?, ClearCredentialException> {
                    override fun onResult(result: Void?) {
                        promise.resolve(true)
                    }

                    override fun onError(e: ClearCredentialException) {
                        promise.reject(e.type ?: "clear_failed", e.errorMessage?.toString() ?: e.message)
                    }
                },
            )
        } catch (e: Exception) {
            promise.reject("request_invalid", e.message)
        }
    }
}
