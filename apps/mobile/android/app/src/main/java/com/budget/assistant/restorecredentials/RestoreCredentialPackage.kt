package com.budget.assistant.restorecredentials

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

/**
 * ReactPackage that exposes RestoreCredentialModule to the JS bridge.
 * Registered manually in MainApplication.kt:getPackages() — no autolink,
 * no TurboModule spec, no codegen (CLAUDE.md build constraint).
 */
class RestoreCredentialPackage : ReactPackage {
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =
        listOf(RestoreCredentialModule(reactContext))

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> =
        emptyList()
}
