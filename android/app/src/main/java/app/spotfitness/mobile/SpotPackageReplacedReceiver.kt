package app.spotfitness.mobile

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import java.io.File

class SpotPackageReplacedReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        if (intent?.action != Intent.ACTION_MY_PACKAGE_REPLACED) return

        // ניקוי קובץ ההתקנה הזמני מהמטמון אחרי שדרוג מוצלח
        try {
            File(context.cacheDir, "spot-fitness-update.apk").delete()
            File(context.cacheDir, "spot-fitness-update.apk.tmp").delete()
        } catch (_: Throwable) {
            // ignore
        }

        val launchIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)?.apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        } ?: return

        // הצגת התראה עם פתיחה בלחיצה מיד בסיום העדכון + ניסיון פתיחה מיידי במכשירים שמתירים זאת
        try {
            val hasNotifPerm = Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
                ContextCompat.checkSelfPermission(
                    context,
                    Manifest.permission.POST_NOTIFICATIONS
                ) == PackageManager.PERMISSION_GRANTED

            if (hasNotifPerm) {
                val channelId = "spot_coach_alerts"
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    val nm = context.getSystemService(NotificationManager::class.java)
                    nm?.createNotificationChannel(
                        NotificationChannel(
                            channelId,
                            "עדכוני מערכת והמאמן",
                            NotificationManager.IMPORTANCE_HIGH
                        )
                    )
                }

                val pending = PendingIntent.getActivity(
                    context,
                    7010,
                    launchIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                )

                val notif = NotificationCompat.Builder(context, channelId)
                    .setSmallIcon(R.drawable.ic_stat_spot)
                    .setContentTitle("SPOT Fitness עודכנה בהצלחה")
                    .setContentText("הגרסה החדשה מוכנה — הקש לפתיחת האפליקציה")
                    .setPriority(NotificationCompat.PRIORITY_HIGH)
                    .setAutoCancel(true)
                    .setContentIntent(pending)
                    .build()

                NotificationManagerCompat.from(context).notify(7010, notif)
            }
        } catch (_: Throwable) {
            // ignore notification failure
        }

        try {
            context.startActivity(launchIntent)
        } catch (_: Throwable) {
            // Android 10+ עשוי לחסום פתיחת Activity אוטומטית מהרקע — המשתמש יקבל התראה + כפתור "פתח" של אנדרואיד
        }
    }
}
