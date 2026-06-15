package jsoneri.redviewer.mobile

import android.content.Context
import android.net.wifi.WifiManager
import android.util.Log

object MulticastLockManager {
    private const val TAG = "MulticastLockManager"
    private const val LOCK_TAG = "redViewer:udp_discovery"

    private var multicastLock: WifiManager.MulticastLock? = null

    @Synchronized
    fun acquire(context: Context) {
        try {
            if (multicastLock == null) {
                val wifiManager = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
                multicastLock = wifiManager.createMulticastLock(LOCK_TAG)
                multicastLock?.setReferenceCounted(false)
            }

            if (multicastLock?.isHeld == false) {
                multicastLock?.acquire()
                Log.d(TAG, "Multicast lock acquired")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to acquire multicast lock", e)
        }
    }

    @Synchronized
    fun release() {
        try {
            if (multicastLock?.isHeld == true) {
                multicastLock?.release()
                Log.d(TAG, "Multicast lock released")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to release multicast lock", e)
        }
    }
}
