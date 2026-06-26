package expo.modules.matchprogressuploader

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.util.Log
import androidx.core.content.ContextCompat
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
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

  // NATIVE DISTANCE ACCUMULATOR — a GPS consumer that advances the run's distance while the screen
  // is off (JS suspended). Fed by FusedLocationProviderClient (preferred) or LocationManager
  // GPS_PROVIDER (fallback when Play Services is missing). The accumulated total is read
  // synchronously by the module via DistanceAccumulatorBus, and the merge in JS takes
  // max(jsKm, nativeKm) — so this can only ADD distance JS missed while suspended, never subtract.
  private val distanceAccumulator = DistanceAccumulator()
  @Volatile private var distanceWanted = false
  private var fusedClient: FusedLocationProviderClient? = null
  private var fusedCallback: LocationCallback? = null
  private var legacyLocationManager: LocationManager? = null
  private var legacyLocationListener: LocationListener? = null

  private var isForegroundStarted = false

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_STOP -> {
        stopEverything()
        return START_NOT_STICKY
      }
      ACTION_DISTANCE_START -> {
        // Begin native GPS distance accumulation. Configure the JS filter constants, drop the per-fix
        // anchor (first fix only sets the origin), and bring the foreground service + wakelock up so
        // GPS keeps flowing screen-off — WITHOUT touching the periodic re-POST scheduler.
        intent.let { distanceAccumulator.configureFromIntent(it) }
        distanceAccumulator.beginSession()
        distanceWanted = true
        ensureForeground()
        ensureWakeLock()
        startDistanceUpdates()
      }
      ACTION_DISTANCE_SEED -> {
        val seedMeters = intent.getDoubleExtra(EXTRA_DISTANCE_SEED_METERS, 0.0)
        distanceAccumulator.seed(seedMeters)
        // Publish so a synchronous getAccumulatedDistanceMeters() right after seed returns the seed.
        MatchDistanceBus.emit(distanceAccumulator.totalMeters)
      }
      ACTION_DISTANCE_RESET -> {
        distanceAccumulator.reset()
        MatchDistanceBus.reset()
      }
      ACTION_DISTANCE_STOP -> {
        // Stop ONLY the distance consumer; the periodic re-POST may still need the service alive.
        distanceWanted = false
        stopDistanceUpdates()
        stopServiceIfIdle()
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

  // ACTION_STOP (periodic re-POST teardown). Stop the scheduler + clear the cached payload, then
  // fully tear the service down ONLY if the distance accumulator no longer needs it either — so a
  // periodic stop never kills a still-active screen-off distance consumer.
  private fun stopEverything() {
    stopScheduler()
    periodicUrl = null
    periodicToken = null
    periodicBody = null
    stopServiceIfIdle()
  }

  // Fully tear down the service (wakelock + foreground + stopSelf) ONLY when NEITHER the periodic
  // re-POST nor the distance accumulator needs it. Either consumer stopping calls this; the last one
  // out releases everything so nothing drains battery after the match.
  private fun stopServiceIfIdle() {
    if (distanceWanted || scheduledTask != null) {
      return
    }

    stopDistanceUpdates()
    releaseWakeLock()
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

  // MARK: Native distance GPS consumer

  // Start the GPS consumer that feeds the distance accumulator. Prefer FusedLocationProviderClient;
  // fall back to LocationManager GPS_PROVIDER when Play Services is unavailable. NEVER crashes the
  // service — any failure just leaves the JS distance pipeline as the only source.
  private fun startDistanceUpdates() {
    if (!hasFineLocationPermission()) {
      // The live run already holds ACCESS_FINE_LOCATION; if somehow revoked, no-op (JS stays source).
      Log.w(TAG, "distance updates skipped: no fine-location permission")
      return
    }

    if (startFusedDistanceUpdates()) {
      return
    }

    startLegacyDistanceUpdates()
  }

  private fun startFusedDistanceUpdates(): Boolean {
    if (fusedCallback != null) {
      return true
    }

    return try {
      val client = fusedClient ?: LocationServices.getFusedLocationProviderClient(this).also { fusedClient = it }
      val request = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, FUSED_INTERVAL_MS)
        .setMinUpdateDistanceMeters(0f)
        .build()
      val callback = object : LocationCallback() {
        override fun onLocationResult(result: LocationResult) {
          result.locations.forEach { onDistanceLocation(it) }
        }
      }
      // Deliver on the main looper (the callback only touches @Volatile + the bus — no GPS work).
      client.requestLocationUpdates(request, callback, Looper.getMainLooper())
      fusedCallback = callback
      true
    } catch (error: Throwable) {
      // Play Services missing / threw — fall back to LocationManager below.
      Log.w(TAG, "fused distance updates failed: ${error.message}")
      fusedCallback = null
      false
    }
  }

  private fun startLegacyDistanceUpdates() {
    if (legacyLocationListener != null) {
      return
    }

    try {
      val manager = legacyLocationManager
        ?: (getSystemService(Context.LOCATION_SERVICE) as? LocationManager)?.also { legacyLocationManager = it }
        ?: return
      if (!manager.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
        return
      }
      val listener = LocationListener { location -> onDistanceLocation(location) }
      manager.requestLocationUpdates(
        LocationManager.GPS_PROVIDER,
        FUSED_INTERVAL_MS,
        0f,
        listener,
        Looper.getMainLooper(),
      )
      legacyLocationListener = listener
    } catch (error: Throwable) {
      Log.w(TAG, "legacy distance updates failed: ${error.message}")
      legacyLocationListener = null
    }
  }

  private fun stopDistanceUpdates() {
    fusedCallback?.let { callback ->
      try {
        fusedClient?.removeLocationUpdates(callback)
      } catch (error: Throwable) {
        Log.w(TAG, "fused removeLocationUpdates failed: ${error.message}")
      }
    }
    fusedCallback = null

    legacyLocationListener?.let { listener ->
      try {
        legacyLocationManager?.removeUpdates(listener)
      } catch (error: Throwable) {
        Log.w(TAG, "legacy removeUpdates failed: ${error.message}")
      }
    }
    legacyLocationListener = null
  }

  // Feed one delivered fix into the accumulator; emit the new total via the bus only on a real
  // advance. Self-gates on distanceWanted so a fix delivered during teardown is ignored.
  private fun onDistanceLocation(location: Location) {
    if (!distanceWanted) {
      return
    }
    val advanced = distanceAccumulator.consume(location)
    if (advanced != null) {
      MatchDistanceBus.emit(advanced)
    }
  }

  private fun hasFineLocationPermission(): Boolean {
    return ContextCompat.checkSelfPermission(
      this,
      android.Manifest.permission.ACCESS_FINE_LOCATION,
    ) == PackageManager.PERMISSION_GRANTED
  }

  override fun onDestroy() {
    // Final safety net: release the wakelock + scheduler + GPS consumer even if a stop path was not
    // reached, so nothing leaks past service teardown.
    distanceWanted = false
    stopScheduler()
    stopDistanceUpdates()
    releaseWakeLock()
    super.onDestroy()
  }

  companion object {
    private const val TAG = "RGNativeUpload"

    const val ACTION_START = "expo.modules.matchprogressuploader.action.START"
    const val ACTION_UPDATE = "expo.modules.matchprogressuploader.action.UPDATE"
    const val ACTION_STOP = "expo.modules.matchprogressuploader.action.STOP"

    // NATIVE DISTANCE ACCUMULATOR intents (mirror the START/UPDATE/STOP shape above).
    const val ACTION_DISTANCE_START = "expo.modules.matchprogressuploader.action.DISTANCE_START"
    const val ACTION_DISTANCE_SEED = "expo.modules.matchprogressuploader.action.DISTANCE_SEED"
    const val ACTION_DISTANCE_RESET = "expo.modules.matchprogressuploader.action.DISTANCE_RESET"
    const val ACTION_DISTANCE_STOP = "expo.modules.matchprogressuploader.action.DISTANCE_STOP"

    const val EXTRA_URL = "url"
    const val EXTRA_TOKEN = "token"
    const val EXTRA_BODY = "body"
    const val EXTRA_INTERVAL_MS = "intervalMs"

    // Distance accumulator extras: the JS filter constants + the seed total.
    const val EXTRA_DISTANCE_SEED_METERS = "distanceSeedMeters"
    const val EXTRA_MAX_ACCURACY_METERS = "maxAccuracyMeters"
    const val EXTRA_DISTANCE_GATE_BASE_METERS = "distanceGateBaseMeters"
    const val EXTRA_DISTANCE_GATE_ACCURACY_SCALE = "distanceGateAccuracyScale"
    const val EXTRA_TELEPORT_MIN_METERS = "teleportMinMeters"
    const val EXTRA_MAX_SPEED_MPS = "maxSpeedMps"
    const val EXTRA_MAX_LOCATION_AGE_MS = "maxLocationAgeMs"

    private const val DEFAULT_INTERVAL_MS = 3000L
    // ~2s GPS cadence for the distance consumer (the accumulator consumes every fix; the gate
    // collapses noise). minUpdateDistanceMeters=0 so a slow drift still produces fixes.
    private const val FUSED_INTERVAL_MS = 2000L
    private const val NOTIFICATION_ID = 0x52474D55 // "RGMU"
    private const val CHANNEL_ID = "match_uploader"
    private const val CHANNEL_NAME = "러닝 기록 동기화"
    private const val CHANNEL_DESCRIPTION = "대결 중 백그라운드에서 기록을 계속 전송합니다."
    private const val NOTIFICATION_TITLE = "러닝그라운드 기록 전송 중"
    private const val NOTIFICATION_BODY = "화면이 꺼져도 대결 기록이 계속 전송됩니다."
    private const val WAKE_LOCK_TAG = "RunningGround:matchUpload"
  }
}

/**
 * DistanceAccumulator — native running-total distance, advanced from the foreground service's GPS
 * consumer so a run's distance keeps moving while the JS thread is suspended (screen off). Mirrors
 * the JS per-segment filter chain (src/features/runs/tracking/background/locationDistance.ts +
 * routeAccumulator.ts) 1:1, pared to the gate the screen-off case needs (it does NOT replicate JS's
 * route-history cold-start / jitter-collapse passes — the native side keeps no route history). The
 * JS merge takes max(jsKm, nativeKm), so this conservative-by-design total can only ADD distance JS
 * missed while suspended, never subtract or jump JS backward.
 *
 * Threading: configure/seed/reset/beginSession come from onStartCommand (main thread); consume()
 * comes from the LocationCallback (main looper). totalMeters is read synchronously from the module
 * (any thread), so the total is @Volatile and advanced under a small lock — no GPS work under it.
 */
private class DistanceAccumulator {
  // JS filter constants. Defaults mirror the JS source values so a missing extra can never widen the
  // gate open.
  @Volatile private var maxAccuracyMeters: Double = 60.0
  @Volatile private var distanceGateBaseMeters: Double = 2.5
  @Volatile private var distanceGateAccuracyScale: Double = 0.15
  @Volatile private var teleportMinMeters: Double = 35.0
  @Volatile private var maxSpeedMps: Double = 8.5
  @Volatile private var maxLocationAgeMs: Double = 15000.0

  // The last COUNTED fix (the distance-gate anchor — mirrors JS lastCountedPoint). null until the
  // first accepted fix, so the first fix only sets the anchor (no initial jump). Touched only on the
  // GPS-callback thread (the main looper) + onStartCommand (main thread).
  private var lastCounted: Location? = null

  // Running total in meters. @Volatile for the cross-thread synchronous read; advanced under `lock`.
  @Volatile private var total: Double = 0.0
  private val lock = Any()

  val totalMeters: Double
    get() = total

  fun configureFromIntent(intent: Intent) {
    maxAccuracyMeters = intent.readDouble(MatchUploadForegroundService.EXTRA_MAX_ACCURACY_METERS, maxAccuracyMeters)
    distanceGateBaseMeters = intent.readDouble(MatchUploadForegroundService.EXTRA_DISTANCE_GATE_BASE_METERS, distanceGateBaseMeters)
    distanceGateAccuracyScale = intent.readDouble(MatchUploadForegroundService.EXTRA_DISTANCE_GATE_ACCURACY_SCALE, distanceGateAccuracyScale)
    teleportMinMeters = intent.readDouble(MatchUploadForegroundService.EXTRA_TELEPORT_MIN_METERS, teleportMinMeters)
    maxSpeedMps = intent.readDouble(MatchUploadForegroundService.EXTRA_MAX_SPEED_MPS, maxSpeedMps)
    maxLocationAgeMs = intent.readDouble(MatchUploadForegroundService.EXTRA_MAX_LOCATION_AGE_MS, maxLocationAgeMs)
  }

  // Drop the per-fix anchor so the FIRST fix after start only sets the origin (no initial jump). The
  // running total is PRESERVED (the JS side seeds the baseline separately).
  fun beginSession() {
    lastCounted = null
  }

  // Set the running total to the JS authoritative total at start so native and JS share one origin.
  fun seed(meters: Double) {
    synchronized(lock) {
      total = if (meters.isFinite() && meters > 0) meters else 0.0
    }
  }

  // Full reset (new run): zero the total and drop the anchor.
  fun reset() {
    lastCounted = null
    synchronized(lock) {
      total = 0.0
    }
  }

  // Consume one delivered fix. Returns the NEW total in meters when the fix advanced the distance, or
  // null when the fix was rejected/gated. Mirrors the JS appendTrackedLocation per-segment path:
  //   - reject accuracy < 0 (invalid) or > maxAccuracyMeters (MAX_TRACKING_ACCURACY_METERS)
  //   - reject if abs(now - fixTime) > maxLocationAgeMs (resolveLocationTimestampMs age window)
  //   - first accepted fix only sets the anchor (no jump)
  //   - segment = last.distanceTo(current) (Location.distanceTo — geodesic, battery-free)
  //   - gate = distanceGateBaseMeters + worstAccuracy * distanceGateAccuracyScale; skip if seg < gate
  //   - teleport: skip if seg >= teleportMinMeters AND seg/dt > maxSpeedMps
  //   - else total += seg, advance the anchor, return the new total
  fun consume(current: Location): Double? {
    val accuracy = if (current.hasAccuracy()) current.accuracy.toDouble() else 0.0
    if (current.hasAccuracy() && (accuracy < 0 || accuracy > maxAccuracyMeters)) {
      return null
    }

    val ageMs = Math.abs(System.currentTimeMillis() - current.time).toDouble()
    if (ageMs > maxLocationAgeMs) {
      return null
    }

    val last = lastCounted
    if (last == null) {
      lastCounted = current
      return null
    }

    val segmentMeters = last.distanceTo(current).toDouble()
    val lastAccuracy = if (last.hasAccuracy()) last.accuracy.toDouble() else 0.0
    val worstAccuracy = Math.max(if (lastAccuracy >= 0) lastAccuracy else 0.0, if (accuracy >= 0) accuracy else 0.0)
    val gate = distanceGateBaseMeters + worstAccuracy * distanceGateAccuracyScale

    if (segmentMeters < gate) {
      return null
    }

    val dtSeconds = (current.time - last.time) / 1000.0
    if (segmentMeters >= teleportMinMeters && dtSeconds > 0 && (segmentMeters / dtSeconds) > maxSpeedMps) {
      return null
    }

    val newTotal: Double
    synchronized(lock) {
      total += segmentMeters
      newTotal = total
    }
    lastCounted = current
    return newTotal
  }
}

private fun Intent.readDouble(key: String, fallback: Double): Double {
  val value = getDoubleExtra(key, Double.NaN)
  return if (value.isFinite()) value else fallback
}
