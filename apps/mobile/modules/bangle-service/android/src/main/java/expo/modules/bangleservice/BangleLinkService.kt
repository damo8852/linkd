package expo.modules.bangleservice

import android.app.PendingIntent
import android.content.Intent
import android.content.pm.ServiceInfo
import android.util.Log
import androidx.core.app.NotificationChannelCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.ServiceCompat
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

/**
 * Keeps the bangle link alive while the app is in the background: a `connectedDevice` foreground
 * service (process stays alive, BLE stays connected) that also holds one never-ending Headless JS
 * task, because React Native stops JS timers in the background unless a headless task is running
 * (JavaTimerManager). Sticky, so Android restarts it after killing the process.
 *
 * On failure: if Android refuses `startForeground` (e.g. Bluetooth permission revoked) the service
 * logs and stops; the link still works while the app is open.
 */
class BangleLinkService : HeadlessJsTaskService() {
  private var taskStarted = false

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    try {
      ServiceCompat.startForeground(
        this,
        NOTIFICATION_ID,
        buildNotification(),
        ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE,
      )
    } catch (error: Exception) {
      Log.w(TAG, "startForeground refused", error)
      stopSelf()
      return START_NOT_STICKY
    }
    if (!taskStarted) {
      taskStarted = true
      super.onStartCommand(intent, flags, startId)
    }
    return START_STICKY
  }

  override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig =
    // No timeout, and allowed while the app is in the foreground (it is started from there).
    HeadlessJsTaskConfig(TASK_KEY, Arguments.createMap(), 0, true)

  private fun buildNotification(): android.app.Notification {
    val manager = NotificationManagerCompat.from(this)
    manager.createNotificationChannel(
      NotificationChannelCompat.Builder(CHANNEL_ID, NotificationManagerCompat.IMPORTANCE_LOW)
        .setName("Bangle connection")
        .setShowBadge(false)
        .build(),
    )
    val open = packageManager.getLaunchIntentForPackage(packageName)?.let {
      PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_IMMUTABLE)
    }
    // Discreet: says nothing about safety or SOS on a lock screen.
    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle("LINKD")
      .setContentText("Connected")
      .setSmallIcon(applicationInfo.icon)
      .setContentIntent(open)
      .setOngoing(true)
      .setSilent(true)
      .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
      .build()
  }

  companion object {
    /** Must match the task registered in index.ts. */
    const val TASK_KEY = "LinkdBackgroundLink"
    private const val TAG = "BangleLinkService"
    private const val CHANNEL_ID = "bangle-link"
    private const val NOTIFICATION_ID = 7301
  }
}
