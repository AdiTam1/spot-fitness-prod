package app.spotfitness.mobile

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.webkit.CookieManager
import com.getcapacitor.BridgeActivity

data class PendingPushNavigation(
    val pushId: String,
    val screen: String,
    val mealSlotId: String,
    val date: String,
    val kind: String
)

object SpotPendingPushTarget {
    private var pending: PendingPushNavigation? = null

    @Synchronized
    fun captureFromIntent(intent: Intent?) {
        val extras = intent?.extras ?: return
        val screen = extras.getString("spotScreen")?.trim().orEmpty()
        val mealSlotId = extras.getString("spotMealSlotId")?.trim().orEmpty()
        val date = extras.getString("spotDate")?.trim().orEmpty()
        val pushId = extras.getString("spotPushId")?.trim()
            ?: extras.getString("google.message_id")?.trim().orEmpty()
        val kind = extras.getString("spotKind")?.trim().orEmpty()

        if (screen.isEmpty() && mealSlotId.isEmpty() && date.isEmpty()) return

        pending = PendingPushNavigation(
            pushId = pushId,
            screen = screen.ifEmpty { "journal" },
            mealSlotId = mealSlotId,
            date = date,
            kind = kind
        )
    }

    @Synchronized
    fun consume(): PendingPushNavigation? {
        val current = pending
        pending = null
        return current
    }
}

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        ensureNotificationChannels()
        SpotPendingPushTarget.captureFromIntent(intent)
        // רישום הפלאגין לפני super.onCreate כדי שה-Launchers יירשמו לפני מצב STARTED
        registerPlugin(SpotHealthStepsPlugin::class.java)
        super.onCreate(savedInstanceState)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        SpotPendingPushTarget.captureFromIntent(intent)
    }

    override fun onPause() {
        super.onPause()
        flushCookiesSafely()
    }

    override fun onStop() {
        super.onStop()
        flushCookiesSafely()
    }

    private fun ensureNotificationChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        try {
            val nm = getSystemService(NotificationManager::class.java) ?: return

            val aiChannel = NotificationChannel(
                "spot_ai_meals",
                "זיהוי ארוחות AI",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "התראות אוטומטיות כאשר ניתוח ארוחה ב-AI מסתיים ברקע"
                enableVibration(true)
                setShowBadge(true)
            }

            val coachChannel = NotificationChannel(
                "spot_coach_alerts",
                "הודעות ותזכורות מהמאמן",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "פושים אישיים ותזכורות ישירות מהמאמן המלווה"
                enableVibration(true)
                setShowBadge(true)
            }

            nm.createNotificationChannel(aiChannel)
            nm.createNotificationChannel(coachChannel)
        } catch (_: Exception) {
        }
    }

    private fun flushCookiesSafely() {
        try {
            // שומר את עוגיית הסשן לדיסק מיידית כדי למנוע איבוד התחברות בסגירה מהירה של האפליקציה
            CookieManager.getInstance().flush()
        } catch (_: Exception) {
        }
    }
}
