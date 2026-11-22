package app.spotfitness.mobile

import android.os.Bundle
import android.webkit.CookieManager
import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        // רישום הפלאגין לפני super.onCreate כדי שה-Launchers יירשמו לפני מצב STARTED
        registerPlugin(SpotHealthStepsPlugin::class.java)
        super.onCreate(savedInstanceState)
    }

    override fun onPause() {
        super.onPause()
        flushCookiesSafely()
    }

    override fun onStop() {
        super.onStop()
        flushCookiesSafely()
    }

    private fun flushCookiesSafely() {
        try {
            // שומר את עוגיית הסשן לדיסק מיידית כדי למנוע איבוד התחברות בסגירה מהירה של האפליקציה
            CookieManager.getInstance().flush()
        } catch (_: Exception) {
        }
    }
}
