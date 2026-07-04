package jsoneri.redviewer.mobile

import android.os.Bundle
import android.util.Log
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)

    // Acquire multicast lock for UDP discovery
    Log.d("MainActivity", "Acquiring multicast lock for UDP discovery...")
    try {
      MulticastLockManager.acquire(this)
      Log.d("MainActivity", "Multicast lock acquired successfully")
    } catch (e: Exception) {
      Log.e("MainActivity", "Failed to acquire multicast lock", e)
    }
  }

  override fun onDestroy() {
    super.onDestroy()
    MulticastLockManager.release()
  }
}
