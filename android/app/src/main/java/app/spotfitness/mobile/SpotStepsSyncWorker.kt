package app.spotfitness.mobile

import android.content.Context
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.time.Instant
import java.time.LocalDate
import java.util.concurrent.TimeUnit

class SpotStepsSyncWorker(
    appContext: Context,
    workerParams: WorkerParameters
) : CoroutineWorker(appContext, workerParams) {

    override suspend fun doWork(): Result {
        val config = SpotStepsEngine.getSyncConfig(applicationContext)
        if (!config.enabled || config.baseUrl.isBlank() || config.syncToken.isBlank()) {
            return Result.success()
        }

        // לא פותחים SensorEventListener ב-WorkManager כדי למנוע תקיעת HAL;
        // משתמשים אך ורק ב-Health Connect (עם READ_HEALTH_DATA_IN_BACKGROUND) או FitnessLocal
        val today = LocalDate.now()
        val yesterday = today.minusDays(1)
        val readings = SpotStepsEngine.readDailySteps(
            context = applicationContext,
            requestedDates = listOf(yesterday.toString(), today.toString()),
            allowSensorFallback = false
        )

        if (readings.isEmpty()) {
            return Result.success()
        }

        val nowIso = Instant.now().toString()
        val entriesArray = JSONArray()
        for (r in readings) {
            val obj = JSONObject().apply {
                put("date", r.date)
                put("steps", r.steps)
                put("source", r.source)
                put("syncedAt", nowIso)
            }
            entriesArray.put(obj)
        }
        val bodyJson = JSONObject().put("entries", entriesArray).toString()

        val statusCode = withContext(Dispatchers.IO) {
            postStepsJson(config.baseUrl, config.syncToken, bodyJson)
        }

        return when {
            statusCode in 200..299 -> Result.success()
            statusCode == 401 || statusCode == 403 -> {
                SpotStepsEngine.saveSyncConfig(applicationContext, "", "", false)
                Result.failure()
            }
            else -> Result.retry()
        }
    }

    private fun postStepsJson(baseUrl: String, syncToken: String, jsonBody: String): Int {
        var conn: HttpURLConnection? = null
        return try {
            val endpoint = URL("${baseUrl.trimEnd('/')}/api/steps/sync")
            conn = (endpoint.openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                connectTimeout = 15000
                readTimeout = 15000
                doOutput = true
                setRequestProperty("Content-Type", "application/json; charset=utf-8")
                setRequestProperty("Authorization", "Bearer $syncToken")
                setRequestProperty("Origin", baseUrl.trimEnd('/'))
            }
            OutputStreamWriter(conn.outputStream, Charsets.UTF_8).use { writer ->
                writer.write(jsonBody)
                writer.flush()
            }
            conn.responseCode
        } catch (_: Exception) {
            503
        } finally {
            conn?.disconnect()
        }
    }

    companion object {
        private const val UNIQUE_WORK_NAME = "spot_periodic_steps_sync"

        fun schedule(context: Context) {
            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()

            val request = PeriodicWorkRequestBuilder<SpotStepsSyncWorker>(2, TimeUnit.HOURS)
                .setConstraints(constraints)
                .build()

            WorkManager.getInstance(context.applicationContext).enqueueUniquePeriodicWork(
                UNIQUE_WORK_NAME,
                ExistingPeriodicWorkPolicy.KEEP,
                request
            )
        }

        fun cancel(context: Context) {
            WorkManager.getInstance(context.applicationContext).cancelUniqueWork(UNIQUE_WORK_NAME)
        }
    }
}
