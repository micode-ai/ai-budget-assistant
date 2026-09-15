package com.budget.assistant.installreferrer

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

/**
 * ReactPackage that exposes InstallReferrerModule to the JS bridge.
 * Registered manually in MainApplication.kt:getPackages() — no autolink,
 * no TurboModule spec, no codegen (CLAUDE.md build constraint).
 */
class InstallReferrerPackage : ReactPackage {
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =
        listOf(InstallReferrerModule(reactContext))

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> =
        emptyList()
}
