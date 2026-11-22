package app.spotfitness.mobile

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.hardware.Sensor
import android.hardware.SensorManager
import android.os.Build
import androidx.core.content.ContextCompat
import androidx.core.content.pm.PackageInfoCompat
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.HealthConnectFeatures
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.request.AggregateGroupByPeriodRequest
import androidx.health.connect.client.time.TimeRangeFilter
import com.google.android.gms.common.ConnectionResult
import com.google.android.gms.common.GoogleApiAvailability
import com.google.android.gms.fitness.FitnessLocal
import com.google.android.gms.fitness.LocalRecordingClient
import com.google.android.gms.fitness.data.LocalDataType
import com.google.android.gms.fitness.data.LocalField
import com.google.android.gms.fitness.request.LocalDataReadRequest
import kotlinx.coroutines.tasks.await
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.Period
import java.time.ZoneId
import java.util.concurrent.TimeUnit

data class DailyStepReading(
    val date: String,
    val steps: Int,
    val source: String
)

data class StepEngineStatusSnapshot(
    val healthConnectStatus: String,
    val activityRecognitionGranted: Boolean,
    val healthConnectStepsGranted: Boolean,
    val healthConnectBackgroundGranted: Boolean,
    val hasGooglePlayServices: Boolean,
    val hasStepSensor: Boolean,
    val healthConnectCancelCount: Int,
    val deviceManufacturer: String,
    val androidSdkInt: Int,
    val versionCode: Long,
    val versionName: String
)

data class StepsSyncConfig(
    val baseUrl: String,
    val syncToken: String,
    val enabled: Boolean
)

object SpotStepsEngine {
    private const val PREFS_NAME = "spot_steps_prefs"
    private const val KEY_SYNC_ENABLED = "sync_enabled"
    private const val KEY_BASE_URL = "base_url"
    private const val KEY_SYNC_TOKEN = "sync_token"
    private const val KEY_HC_CANCEL_COUNT = "hc_cancel_count"
    private const val KEY_SENSOR_DATE = "sensor_date"
    private const val KEY_SENSOR_LAST_RAW = "sensor_last_raw"
    private const val KEY_SENSOR_TODAY_STEPS = "sensor_today_steps"

    val stepsReadPermission: String = HealthPermission.getReadPermission(StepsRecord::class)
    val backgroundReadPermission: String = HealthPermission.PERMISSION_READ_HEALTH_DATA_IN_BACKGROUND

    private fun prefs(context: Context) =
        context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    fun saveSyncConfig(context: Context, baseUrl: String, syncToken: String, enabled: Boolean) {
        prefs(context).edit().apply {
            putBoolean(KEY_SYNC_ENABLED, enabled && baseUrl.isNotBlank() && syncToken.isNotBlank())
            putString(KEY_BASE_URL, baseUrl.trimEnd('/'))
            putString(KEY_SYNC_TOKEN, syncToken)
            apply()
        }
    }

    fun getSyncConfig(context: Context): StepsSyncConfig {
        val p = prefs(context)
        return StepsSyncConfig(
            baseUrl = p.getString(KEY_BASE_URL, "") ?: "",
            syncToken = p.getString(KEY_SYNC_TOKEN, "") ?: "",
            enabled = p.getBoolean(KEY_SYNC_ENABLED, false)
        )
    }

    fun getHealthConnectCancelCount(context: Context): Int =
        prefs(context).getInt(KEY_HC_CANCEL_COUNT, 0)

    fun incrementHealthConnectCancelCount(context: Context): Int {
        val next = getHealthConnectCancelCount(context) + 1
        prefs(context).edit().putInt(KEY_HC_CANCEL_COUNT, next).apply()
        return next
    }

    fun resetHealthConnectCancelCount(context: Context) {
        prefs(context).edit().putInt(KEY_HC_CANCEL_COUNT, 0).apply()
    }

    fun hasActivityRecognitionPermission(context: Context): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return true
        return ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.ACTIVITY_RECOGNITION
        ) == PackageManager.PERMISSION_GRANTED
    }

    fun getHealthConnectAvailability(context: Context): String {
        return try {
            when (HealthConnectClient.getSdkStatus(context)) {
                HealthConnectClient.SDK_AVAILABLE -> "installed"
                HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> "update-required"
                else -> if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) "not-supported" else "not-installed"
            }
        } catch (_: Throwable) {
            "not-supported"
        }
    }

    fun hasLocalRecordingPlayServices(context: Context): Boolean {
        return try {
            val api = GoogleApiAvailability.getInstance()
            val status = api.isGooglePlayServicesAvailable(
                context,
                LocalRecordingClient.LOCAL_RECORDING_CLIENT_MIN_VERSION_CODE
            )
            status == ConnectionResult.SUCCESS
        } catch (_: Throwable) {
            false
        }
    }

    fun hasHardwareStepSensor(context: Context): Boolean {
        val sm = context.getSystemService(Context.SENSOR_SERVICE) as? SensorManager ?: return false
        return sm.getDefaultSensor(Sensor.TYPE_STEP_COUNTER) != null
    }

    fun getAppVersionInfo(context: Context): Pair<Long, String> {
        return try {
            val pm = context.packageManager
            val info = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                pm.getPackageInfo(context.packageName, PackageManager.PackageInfoFlags.of(0))
            } else {
                @Suppress("DEPRECATION")
                pm.getPackageInfo(context.packageName, 0)
            }
            PackageInfoCompat.getLongVersionCode(info) to (info.versionName ?: "1.0.0")
        } catch (_: Throwable) {
            1L to "1.0.0"
        }
    }

    fun recordForegroundHardwareSensorValue(context: Context, cumulativeSinceBoot: Int) {
        if (cumulativeSinceBoot < 0) return
        val today = LocalDate.now().toString()
        val p = prefs(context)
        val savedDate = p.getString(KEY_SENSOR_DATE, null)
        val lastRaw = p.getInt(KEY_SENSOR_LAST_RAW, -1)
        var todayTotal = if (savedDate == today) p.getInt(KEY_SENSOR_TODAY_STEPS, 0) else 0

        if (savedDate != today || lastRaw < 0) {
            // תחילת יום חדש או קריאה ראשונה: הגדרת נקודת ייחוס חדשה
            p.edit()
                .putString(KEY_SENSOR_DATE, today)
                .putInt(KEY_SENSOR_LAST_RAW, cumulativeSinceBoot)
                .putInt(KEY_SENSOR_TODAY_STEPS, todayTotal)
                .apply()
            return
        }

        val delta = if (cumulativeSinceBoot < lastRaw) {
            // המכשיר עבר ריסטארט והחיישן התאפס ל-0
            cumulativeSinceBoot
        } else {
            cumulativeSinceBoot - lastRaw
        }
        todayTotal = (todayTotal + delta).coerceIn(0, 150000)

        p.edit()
            .putString(KEY_SENSOR_DATE, today)
            .putInt(KEY_SENSOR_LAST_RAW, cumulativeSinceBoot)
            .putInt(KEY_SENSOR_TODAY_STEPS, todayTotal)
            .apply()
    }

    private fun readHardwareSensorStepsForToday(context: Context): Int {
        val today = LocalDate.now().toString()
        val p = prefs(context)
        return if (p.getString(KEY_SENSOR_DATE, null) == today) {
            p.getInt(KEY_SENSOR_TODAY_STEPS, 0)
        } else {
            0
        }
    }

    suspend fun getRequiredHealthConnectPermissions(context: Context): Set<String> {
        val perms = mutableSetOf(stepsReadPermission)
        if (getHealthConnectAvailability(context) == "installed") {
            try {
                val client = HealthConnectClient.getOrCreate(context)
                val bgSupported = client.features.getFeatureStatus(
                    HealthConnectFeatures.FEATURE_READ_HEALTH_DATA_IN_BACKGROUND
                ) == HealthConnectFeatures.FEATURE_STATUS_AVAILABLE
                if (bgSupported) {
                    perms.add(backgroundReadPermission)
                }
            } catch (_: Throwable) {
            }
        }
        return perms
    }

    suspend fun getStatusSnapshot(context: Context): StepEngineStatusSnapshot {
        val hcStatus = getHealthConnectAvailability(context)
        var hcStepsGranted = false
        var hcBgGranted = false

        if (hcStatus == "installed") {
            try {
                val client = HealthConnectClient.getOrCreate(context)
                val granted = client.permissionController.getGrantedPermissions()
                hcStepsGranted = granted.contains(stepsReadPermission)
                hcBgGranted = granted.contains(backgroundReadPermission)
                if (hcStepsGranted) {
                    resetHealthConnectCancelCount(context)
                }
            } catch (_: Throwable) {
            }
        }

        val (vCode, vName) = getAppVersionInfo(context)
        return StepEngineStatusSnapshot(
            healthConnectStatus = hcStatus,
            activityRecognitionGranted = hasActivityRecognitionPermission(context),
            healthConnectStepsGranted = hcStepsGranted,
            healthConnectBackgroundGranted = hcBgGranted,
            hasGooglePlayServices = hasLocalRecordingPlayServices(context),
            hasStepSensor = hasHardwareStepSensor(context),
            healthConnectCancelCount = getHealthConnectCancelCount(context),
            deviceManufacturer = Build.MANUFACTURER ?: "Android",
            androidSdkInt = Build.VERSION.SDK_INT,
            versionCode = vCode,
            versionName = vName
        )
    }

    suspend fun ensureLocalRecordingSubscribed(context: Context) {
        if (!hasActivityRecognitionPermission(context) || !hasLocalRecordingPlayServices(context)) {
            return
        }
        try {
            FitnessLocal.getLocalRecordingClient(context)
                .subscribe(LocalDataType.TYPE_STEP_COUNT_DELTA)
                .await()
        } catch (_: Throwable) {
        }
    }

    /**
     * קריאת צעדים חכמה ב-3 שכבות (Health Connect -> Play Services FitnessLocal -> חיישן מכשיר)
     * מונעת כפילות ספירה וגם מונעת 0 צעדים במכשירים ללא שעון חכם.
     */
    suspend fun readDailySteps(
        context: Context,
        requestedDates: List<String>,
        allowSensorFallback: Boolean = true
    ): List<DailyStepReading> {
        val validDates = requestedDates
            .mapNotNull { raw -> runCatching { LocalDate.parse(raw.trim()) }.getOrNull() }
            .distinct()
            .sorted()
        if (validDates.isEmpty()) return emptyList()

        val resultMap = linkedMapOf<String, DailyStepReading>()
        val minDate = validDates.first()
        val maxDate = validDates.last()
        val today = LocalDate.now()

        // שכבה 1: Health Connect (שעונים חכמים / Samsung Health / Google Fit)
        if (getHealthConnectAvailability(context) == "installed") {
            try {
                val client = HealthConnectClient.getOrCreate(context)
                val granted = client.permissionController.getGrantedPermissions()
                if (granted.contains(stepsReadPermission)) {
                    val nowLdt = LocalDateTime.now()
                    val startLdt = minDate.atStartOfDay()
                    val candidateEnd = maxDate.plusDays(1).atStartOfDay()
                    val endLdt = if (candidateEnd.isAfter(nowLdt)) nowLdt else candidateEnd

                    if (endLdt.isAfter(startLdt)) {
                        val req = AggregateGroupByPeriodRequest(
                            metrics = setOf(StepsRecord.COUNT_TOTAL),
                            timeRangeFilter = TimeRangeFilter.between(startLdt, endLdt),
                            timeRangeSlicer = Period.ofDays(1)
                        )
                        val buckets = client.aggregateGroupByPeriod(req)
                        for (bucket in buckets) {
                            val dStr = bucket.startTime.toLocalDate().toString()
                            val count = (bucket.result[StepsRecord.COUNT_TOTAL] ?: 0L).toInt().coerceAtLeast(0)
                            if (count > 0 && validDates.any { it.toString() == dStr }) {
                                resultMap[dStr] = DailyStepReading(
                                    date = dStr,
                                    steps = count,
                                    source = "health-connect"
                                )
                            }
                        }
                    }
                }
            } catch (_: Throwable) {
            }
        }

        // שכבה 2: Google Play Services Local Recording API (רץ ברקע 24/7 עם היסטוריה של 10 ימים וללא התראה קבועה)
        val remainingDates = validDates.filter { !resultMap.containsKey(it.toString()) }
        if (remainingDates.isNotEmpty() &&
            hasActivityRecognitionPermission(context) &&
            hasLocalRecordingPlayServices(context)
        ) {
            try {
                ensureLocalRecordingSubscribed(context)
                val zone = ZoneId.systemDefault()
                val startSec = minDate.atStartOfDay(zone).toEpochSecond()
                val candidateEndSec = maxDate.plusDays(1).atStartOfDay(zone).toEpochSecond()
                val nowSec = Instant.now().epochSecond
                val endSec = minOf(candidateEndSec, nowSec)

                if (endSec > startSec) {
                    val readReq = LocalDataReadRequest.Builder()
                        .aggregate(LocalDataType.TYPE_STEP_COUNT_DELTA)
                        .bucketByTime(1, TimeUnit.DAYS)
                        .setTimeRange(startSec, endSec, TimeUnit.SECONDS)
                        .build()

                    val response = FitnessLocal.getLocalRecordingClient(context)
                        .readData(readReq)
                        .await()

                    for (bucket in response.buckets) {
                        val bucketDate = Instant.ofEpochMilli(bucket.getStartTime(TimeUnit.MILLISECONDS))
                            .atZone(zone)
                            .toLocalDate()
                            .toString()
                        if (resultMap.containsKey(bucketDate)) continue
                        if (validDates.none { it.toString() == bucketDate }) continue

                        var bucketSteps = 0
                        for (ds in bucket.dataSets) {
                            for (dp in ds.dataPoints) {
                                bucketSteps += runCatching {
                                    dp.getValue(LocalField.FIELD_STEPS).asInt()
                                }.getOrDefault(0)
                            }
                        }
                        if (bucketSteps > 0) {
                            resultMap[bucketDate] = DailyStepReading(
                                date = bucketDate,
                                steps = bucketSteps,
                                source = "play-services-local"
                            )
                        }
                    }
                }
            } catch (_: Throwable) {
            }
        }

        // שכבה 3: גיבוי חיישן חומרה מקומי למכשירים ללא Play Services
        val todayStr = today.toString()
        if (allowSensorFallback &&
            validDates.contains(today) &&
            !resultMap.containsKey(todayStr) &&
            hasHardwareStepSensor(context)
        ) {
            val sensorSteps = readHardwareSensorStepsForToday(context)
            if (sensorSteps > 0) {
                resultMap[todayStr] = DailyStepReading(
                    date = todayStr,
                    steps = sensorSteps,
                    source = "device-sensor"
                )
            }
        }

        return validDates.mapNotNull { resultMap[it.toString()] }
    }
}
