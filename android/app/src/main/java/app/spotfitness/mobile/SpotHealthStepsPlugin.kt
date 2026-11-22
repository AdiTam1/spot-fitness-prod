package app.spotfitness.mobile

import android.Manifest
import android.content.Context
import android.content.Intent
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContracts
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

@CapacitorPlugin(name = "SpotHealthSteps")
class SpotHealthStepsPlugin : Plugin(), SensorEventListener {

    private val pluginScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    private var runtimePermsLauncher: ActivityResultLauncher<Array<String>>? = null
    private var healthConnectLauncher: ActivityResultLauncher<Set<String>>? = null
    private var pendingPermCall: PluginCall? = null
    private var sensorRegistered = false

    override fun load() {
        super.load()
        // רישום Launchers סינכרוני ב-load() (במהלך onCreate לפני ON_START) למניעת LifecycleOwner crash
        runtimePermsLauncher = bridge.activity.registerForActivityResult(
            ActivityResultContracts.RequestMultiplePermissions()
        ) {
            pluginScope.launch {
                continueHealthConnectPermissionStep()
            }
        }

        val hcContract = PermissionController.createRequestPermissionResultContract()
        healthConnectLauncher = bridge.activity.registerForActivityResult(hcContract) { granted ->
            pluginScope.launch {
                val call = pendingPermCall
                pendingPermCall = null
                if (call == null) return@launch

                val grantedSteps = granted.contains(SpotStepsEngine.stepsReadPermission)
                var restrictedHint = false
                if (grantedSteps) {
                    SpotStepsEngine.resetHealthConnectCancelCount(context)
                } else {
                    val cancels = SpotStepsEngine.incrementHealthConnectCancelCount(context)
                    restrictedHint = cancels >= 2 || Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                }

                SpotStepsEngine.ensureLocalRecordingSubscribed(context)
                val snapshot = SpotStepsEngine.getStatusSnapshot(context)
                call.resolve(snapshotToJson(snapshot).apply {
                    put("restrictedSettingsHint", restrictedHint)
                })
            }
        }
    }

    override fun handleOnResume() {
        super.handleOnResume()
        // האזנה חסכונית לחיישן החומרה אך ורק כשהאפליקציה פתוחה ומכשירי Non-GMS צריכים גיבוי
        if (!SpotStepsEngine.hasLocalRecordingPlayServices(context) &&
            SpotStepsEngine.hasActivityRecognitionPermission(context)
        ) {
            val sm = context.getSystemService(Context.SENSOR_SERVICE) as? SensorManager
            val stepSensor = sm?.getDefaultSensor(Sensor.TYPE_STEP_COUNTER)
            if (sm != null && stepSensor != null && !sensorRegistered) {
                sensorRegistered = sm.registerListener(this, stepSensor, SensorManager.SENSOR_DELAY_UI)
            }
        } else {
            pluginScope.launch {
                SpotStepsEngine.ensureLocalRecordingSubscribed(context)
            }
        }
    }

    override fun handleOnPause() {
        super.handleOnPause()
        if (sensorRegistered) {
            val sm = context.getSystemService(Context.SENSOR_SERVICE) as? SensorManager
            sm?.unregisterListener(this)
            sensorRegistered = false
        }
    }

    override fun handleOnDestroy() {
        super.handleOnDestroy()
        pluginScope.cancel()
    }

    override fun onSensorChanged(event: SensorEvent?) {
        if (event?.sensor?.type == Sensor.TYPE_STEP_COUNTER && event.values.isNotEmpty()) {
            SpotStepsEngine.recordForegroundHardwareSensorValue(context, event.values[0].toInt())
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {
        // לא נדרש
    }

    @PluginMethod
    fun getStatus(call: PluginCall) {
        pluginScope.launch {
            val snapshot = SpotStepsEngine.getStatusSnapshot(context)
            call.resolve(snapshotToJson(snapshot))
        }
    }

    @PluginMethod
    fun requestStepPermissions(call: PluginCall) {
        if (pendingPermCall != null) {
            call.reject("Permission flow already in progress")
            return
        }
        pendingPermCall = call

        val missingRuntime = mutableListOf<String>()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q &&
            !SpotStepsEngine.hasActivityRecognitionPermission(context)
        ) {
            missingRuntime.add(Manifest.permission.ACTIVITY_RECOGNITION)
        }

        if (missingRuntime.isNotEmpty() && runtimePermsLauncher != null) {
            bridge.activity.runOnUiThread {
                try {
                    runtimePermsLauncher?.launch(missingRuntime.toTypedArray())
                } catch (e: Exception) {
                    pendingPermCall = null
                    call.reject("Failed requesting activity permission", e)
                }
            }
        } else {
            pluginScope.launch {
                continueHealthConnectPermissionStep()
            }
        }
    }

    private suspend fun continueHealthConnectPermissionStep() {
        val call = pendingPermCall ?: return
        SpotStepsEngine.ensureLocalRecordingSubscribed(context)

        val hcStatus = SpotStepsEngine.getHealthConnectAvailability(context)
        if (hcStatus != "installed") {
            pendingPermCall = null
            val snapshot = SpotStepsEngine.getStatusSnapshot(context)
            call.resolve(snapshotToJson(snapshot).apply {
                put("restrictedSettingsHint", false)
            })
            return
        }

        val required = SpotStepsEngine.getRequiredHealthConnectPermissions(context)
        val client = try {
            HealthConnectClient.getOrCreate(context)
        } catch (_: Throwable) {
            null
        }
        val alreadyGranted = try {
            client?.permissionController?.getGrantedPermissions() ?: emptySet()
        } catch (_: Throwable) {
            emptySet()
        }

        if (alreadyGranted.contains(SpotStepsEngine.stepsReadPermission)) {
            SpotStepsEngine.resetHealthConnectCancelCount(context)
            pendingPermCall = null
            val snapshot = SpotStepsEngine.getStatusSnapshot(context)
            call.resolve(snapshotToJson(snapshot).apply {
                put("restrictedSettingsHint", false)
            })
            return
        }

        if (SpotStepsEngine.getHealthConnectCancelCount(context) >= 2) {
            // הגנה מפני נעילה כפולה של Health Connect: מפנים את המתאמן להנחיית הגדרות ברורה
            pendingPermCall = null
            val snapshot = SpotStepsEngine.getStatusSnapshot(context)
            call.resolve(snapshotToJson(snapshot).apply {
                put("restrictedSettingsHint", true)
            })
            return
        }

        val launcher = healthConnectLauncher
        if (launcher == null) {
            pendingPermCall = null
            val snapshot = SpotStepsEngine.getStatusSnapshot(context)
            call.resolve(snapshotToJson(snapshot))
            return
        }

        bridge.activity.runOnUiThread {
            try {
                launcher.launch(required)
            } catch (_: Throwable) {
                pluginScope.launch {
                    pendingPermCall = null
                    val snapshot = SpotStepsEngine.getStatusSnapshot(context)
                    call.resolve(snapshotToJson(snapshot).apply {
                        put("restrictedSettingsHint", true)
                    })
                }
            }
        }
    }

    @PluginMethod
    fun installOrOpenHealthConnect(call: PluginCall) {
        val hcStatus = SpotStepsEngine.getHealthConnectAvailability(context)
        val launched = bridge.activity.run {
            try {
                if (hcStatus == "installed") {
                    val intent = Intent(HealthConnectClient.ACTION_HEALTH_CONNECT_SETTINGS)
                    startActivity(intent)
                    true
                } else {
                    val marketUri = Uri.parse(
                        "market://details?id=com.google.android.apps.healthdata&url=healthconnect%3A%2F%2Fonboarding"
                    )
                    val playIntent = Intent(Intent.ACTION_VIEW, marketUri).apply {
                        setPackage("com.android.vending")
                        putExtra("overlay", true)
                        putExtra("callerId", packageName)
                    }
                    try {
                        startActivity(playIntent)
                        true
                    } catch (_: Exception) {
                        val webIntent = Intent(
                            Intent.ACTION_VIEW,
                            Uri.parse("https://play.google.com/store/apps/details?id=com.google.android.apps.healthdata")
                        )
                        startActivity(webIntent)
                        true
                    }
                }
            } catch (_: Exception) {
                false
            }
        }
        call.resolve(JSObject().put("opened", launched))
    }

    @PluginMethod
    fun openAppSettings(call: PluginCall) {
        val opened = try {
            val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                data = Uri.fromParts("package", context.packageName, null)
            }
            bridge.activity.startActivity(intent)
            true
        } catch (_: Exception) {
            false
        }
        call.resolve(JSObject().put("opened", opened))
    }

    @PluginMethod
    fun getSteps(call: PluginCall) {
        val arr = call.getArray("dates")
        val dates = mutableListOf<String>()
        if (arr != null) {
            for (i in 0 until arr.length()) {
                val item = arr.optString(i, "")
                if (item.isNotBlank()) dates.add(item)
            }
        }
        pluginScope.launch {
            val readings = SpotStepsEngine.readDailySteps(context, dates, allowSensorFallback = true)
            val outArr = JSArray()
            for (r in readings) {
                outArr.put(
                    JSObject().apply {
                        put("date", r.date)
                        put("steps", r.steps)
                        put("source", r.source)
                    }
                )
            }
            call.resolve(JSObject().put("readings", outArr))
        }
    }

    @PluginMethod
    fun setSyncConfig(call: PluginCall) {
        val baseUrl = call.getString("baseUrl", "") ?: ""
        val syncToken = call.getString("syncToken", "") ?: ""
        val enabled = call.getBoolean("enabled", false) ?: false

        SpotStepsEngine.saveSyncConfig(context, baseUrl, syncToken, enabled)
        if (enabled && baseUrl.isNotBlank() && syncToken.isNotBlank()) {
            SpotStepsSyncWorker.schedule(context)
        } else {
            SpotStepsSyncWorker.cancel(context)
        }
        call.resolve(JSObject().put("ok", true))
    }

    @PluginMethod
    fun getAppVersion(call: PluginCall) {
        val (vCode, vName) = SpotStepsEngine.getAppVersionInfo(context)
        call.resolve(
            JSObject().apply {
                put("versionCode", vCode)
                put("versionName", vName)
            }
        )
    }

    private fun snapshotToJson(s: StepEngineStatusSnapshot): JSObject {
        return JSObject().apply {
            put("available", true)
            put("platform", "android")
            put("healthConnectStatus", s.healthConnectStatus)
            put("activityRecognitionGranted", s.activityRecognitionGranted)
            put("healthConnectStepsGranted", s.healthConnectStepsGranted)
            put("healthConnectBackgroundGranted", s.healthConnectBackgroundGranted)
            put("hasGooglePlayServices", s.hasGooglePlayServices)
            put("hasStepSensor", s.hasStepSensor)
            put("healthConnectCancelCount", s.healthConnectCancelCount)
            put("deviceManufacturer", s.deviceManufacturer)
            put("androidSdkInt", s.androidSdkInt)
            put("versionCode", s.versionCode)
            put("versionName", s.versionName)
        }
    }
}
