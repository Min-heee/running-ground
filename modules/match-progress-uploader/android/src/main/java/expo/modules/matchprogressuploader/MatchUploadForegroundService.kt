package expo.modules.matchprogressuploader

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.util.Log
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

/**
 * MatchUploadForegroundService — the OWN foreground service + wakelock that keeps the native
 * periodic re-POST cadence alive while the screen is off on One UI / Samsung.
 *
 * WHY this exists: the periodic uploader used to piggyback on expo-location's foreground service.
 * When One UI throttles/kills that service, the uploader's ScheduledExecutorService died with it
 * and the Galaxy froze (distance stopped advancing screen-off). This service hosts the ~3s
 * re-POST loop itself, holds its OWN PARTIAL_WAKE_LOCK, and runs in the foreground importance
 * bucket so the OS keeps CPU + network alive independent of expo-location.
 *
 * The native side NEVER recomputes distance/pace/elapsed — it only re-sends the latest JS-built
 * payload handed in via the start/update intents. JS stays the single source of truth.
 *
 * Lifecycle / Android-version correctness:
 *  - startForeground with FOREGROUND_SERVICE_TYPE_LOCATION on API 29+ (gated by Build.VERSION).
 *  - On API < 29, startForeground(id, notification) with no type (the type param did not exist).
 *  - FOREGROUND_SERVICE_LOCATION runtime permission is implied by ACCESS_FINE_LOCATION (already
 *    granted for the live run) on API 34+; the manifest declares the permission so the type is
 *    allowed.
 *  - START_FROM_BACKGROUND (Android 12+/S): this service is ALWAYS started while the run is active
 *    and the app holds a location foreground service, so it is NOT a background start — it is
 *    exempt from the S background-FGS-start restriction. The wrapper module only calls
 *    startForegroundService(...) from startPeriodicUpload, which JS gates strictly to an active
 *    match (app in foreground at the moment the run arms).
 *  - The wakelock is released in ALL exit paths (stop action, onDestroy, exception) so it can
 *    never leak.
 */
class MatchUploadForegroundService : Service() {
  // The ~3s re-POST loop lives HERE now (moved off the module) so it survives as long as this
  // foreground service does, instead of dying when expo-location's service is throttled.
  private var scheduler: ScheduledExecutorService? = null
  private var scheduledTask: ScheduledFuture<*>? = null
  private val periodicInFlight = AtomicBoolean(false)

  // OWN partial wakelock: keeps the CPU running so the scheduler ticks screen-off even under
  // Samsung deep-sleep. Released in stop/onDestroy/exception — never leaked.
  private var wakeLock: PowerManager.WakeLock? = null

  // Latest JS-built payload. @Volatile so the update intent (from the JS/main thread) is visible
  // to the scheduler thread without a lock.
  @Volatile private var periodicUrl: String? = null
  @Volatile private var periodicToken: String? = null
  @Volatile private var periodicBody: String? = null
  @Volatile private var intervalMs: Long = DEFAULT_INTERVAL_MS

  private var isForegroundStarted = false

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_STOP -> {
        stopEverything()
        return START_NOT_STICKY
      }
      else -> {
        // START or UPDATE both carry the freshest payload — cache it.
        intent?.let { applyPayloadFromIntent(it) }
        ensureForeground()
        ensureWakeLock()
        ensureScheduler()
      }
    }

    // STICKY so One UI restarts the service (with a null intent) if it is killed; the JS side
    // re-issues startPeriodicUpload on resume which re-seeds the payload, so a sticky relaunch
    // with stale/empty payload simply no-ops its ticks until then.
    return START_STICKY
  }

  private fun applyPayloadFromIntent(intent: Intent) {
    intent.getStringExtra(EXTRA_URL)?.let { periodicUrl = it }
    intent.getStringExtra(EXTRA_TOKEN)?.let { periodicToken = it }
    intent.getStringExtra(EXTRA_BODY)?.let { periodicBody = it }
    val incomingInterval = intent.getLongExtra(EXTRA_INTERVAL_MS, -1L)
    if (incomingInterval > 0L) {
      intervalMs = incomingInterval
    }
  }

  private fun ensureForeground() {
    if (isForegroundStarted) {
      return
    }

    val notification = buildNotification()
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        // API 29+: a typed foreground service. Use the location type so it shares the same
        // OS treatment as the GPS pipeline it backstops.
        startForeground(
          NOTIFICATION_ID,
          notification,
          ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION,
        )
      } else {
        startForeground(NOTIFICATION_ID, notification)
      }
      isForegroundStarted = true
    } catch (error: Throwable) {
      // If the OS refuses to promote us to foreground (e.g. a missing-permission edge), do NOT
      // crash the host app — the JS-timer + location-task flush remains the fallback.
      Log.w(TAG, "startForeground failed: ${error.message}")
    }
  }

  private fun buildNotification(): Notification {
    val channelId = ensureChannel()

    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(this, channelId)
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(this)
    }

    return builder
      .setContentTitle(NOTIFICATION_TITLE)
      .setContentText(NOTIFICATION_BODY)
      .setSmallIcon(applicationInfo.icon)
      .setOngoing(true)
      .setCategory(Notification.CATEGORY_SERVICE)
      .build()
  }

  private fun ensureChannel(): String {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
      if (notificationManager != null && notificationManager.getNotificationChannel(CHANNEL_ID) == null) {
        val channel = NotificationChannel(
          CHANNEL_ID,
          CHANNEL_NAME,
          NotificationManager.IMPORTANCE_LOW,
        )
        channel.description = CHANNEL_DESCRIPTION
        channel.setShowBadge(false)
        notificationManager.createNotificationChannel(channel)
      }
    }
    return CHANNEL_ID
  }

  private fun ensureWakeLock() {
    if (wakeLock?.isHeld == true) {
      return
    }
    try {
      val powerManager = getSystemService(Context.POWER_SERVICE) as? PowerManager ?: return
      val lock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, WAKE_LOCK_TAG)
      lock.setReferenceCounted(false)
      // No timeout: this match-scoped lock is released deterministically on stop/onDestroy.
      lock.acquire()
      wakeLock = lock
    } catch (error: Throwable) {
      Log.w(TAG, "wakelock acquire failed: ${error.message}")
    }
  }

  private fun releaseWakeLock() {
    val lock = wakeLock ?: return
    try {
      if (lock.isHeld) {
        lock.release()
      }
    } catch (error: Throwable) {
      Log.w(TAG, "wakelock release failed: ${error.message}")
    } finally {
      wakeLock = null
    }
  }

  @Synchronized
  private fun ensureScheduler() {
    if (scheduledTask != null) {
      return
    }
    val interval = if (intervalMs > 0L) intervalMs else DEFAULT_INTERVAL_MS
    val activeScheduler = scheduler
      ?: Executors.newSingleThreadScheduledExecutor().also { scheduler = it }
    periodicInFlight.set(false)
    scheduledTask = activeScheduler.scheduleWithFixedDelay(
      { tickPeriodic() },
      interval,
      interval,
      TimeUnit.MILLISECONDS,
    )
  }

  private fun tickPeriodic() {
    val url = periodicUrl
    val token = periodicToken
    val body = periodicBody
    if (url == null || token == null || body == null) {
      return
    }

    // Native single-flight: a tick never overlaps an in-flight POST. The next tick re-sends the
    // freshest payload anyway.
    if (!periodicInFlight.compareAndSet(false, true)) {
      return
    }

    try {
      val responseBody = MatchUploadHttp.send(url, token, body)
      if (responseBody != null) {
        MatchUploadResponseBus.emit(responseBody)
      }
    } catch (error: Throwable) {
      Log.w(TAG, "tick failed: ${error.message}")
    } finally {
      periodicInFlight.set(false)
    }
  }

  @Synchronized
  private fun stopScheduler() {
    scheduledTask?.cancel(false)
    scheduledTask = null
    scheduler?.shutdownNow()
    scheduler = null
    periodicInFlight.set(false)
  }

  private fun stopEverything() {
    stopScheduler()
    releaseWakeLock()
    periodicUrl = null
    periodicToken = null
    periodicBody = null
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
        stopForeground(STOP_FOREGROUND_REMOVE)
      } else {
        @Suppress("DEPRECATION")
        stopForeground(true)
      }
    } catch (error: Throwable) {
      Log.w(TAG, "stopForeground failed: ${error.message}")
    }
    isForegroundStarted = false
    stopSelf()
  }

  override fun onDestroy() {
    // Final safety net: release the wakelock + scheduler even if stopEverything was not reached.
    stopScheduler()
    releaseWakeLock()
    super.onDestroy()
  }

  companion object {
    private const val TAG = "RGNativeUpload"

    const val ACTION_START = "expo.modules.matchprogressuploader.action.START"
    const val ACTION_UPDATE = "expo.modules.matchprogressuploader.action.UPDATE"
    const val ACTION_STOP = "expo.modules.matchprogressuploader.action.STOP"

    const val EXTRA_URL = "url"
    const val EXTRA_TOKEN = "token"
    const val EXTRA_BODY = "body"
    const val EXTRA_INTERVAL_MS = "intervalMs"

    private const val DEFAULT_INTERVAL_MS = 3000L
    private const val NOTIFICATION_ID = 0x52474D55 // "RGMU"
    private const val CHANNEL_ID = "match_uploader"
    private const val CHANNEL_NAME = "러닝 기록 동기화"
    private const val CHANNEL_DESCRIPTION = "대결 중 백그라운드에서 기록을 계속 전송합니다."
    private const val NOTIFICATION_TITLE = "러닝그라운드 기록 전송 중"
    private const val NOTIFICATION_BODY = "화면이 꺼져도 대결 기록이 계속 전송됩니다."
    private const val WAKE_LOCK_TAG = "RunningGround:matchUpload"
  }
}
