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
import org.json.JSONObject
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

  // 잠든 중 실시간 병합 상한(km). NaN = 병합 꺼짐(기본). JS가 매치 시동 후
  // ACTION_MERGE_CONFIG로 goal − tolerance − epsilon 을 내려보내야만 켜진다 — 옛 JS 번들은
  // 이 액션을 모른 채 두므로 이 바이너리도 이전과 바이트 동일하게 동작한다(fail-closed).
  @Volatile private var mergeCapKm: Double = Double.NaN

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
        // anchors so the session re-runs the cold-start warmup (fixes anchor only after a stable
        // cluster — no distance is banked for the warmup wobble), and bring the foreground service +
        // wakelock up so GPS keeps flowing screen-off — WITHOUT touching the periodic re-POST
        // scheduler.
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
      ACTION_MERGE_CONFIG -> {
        val capKm = intent.getDoubleExtra(EXTRA_MERGE_CAP_KM, Double.NaN)
        // 0 이하·비정상 값은 꺼짐과 같다 — 상한 없는 병합은 존재하지 않는다.
        mergeCapKm = if (capKm.isFinite() && capKm > 0) capKm else Double.NaN
      }
      else -> {
        // START or UPDATE both carry the freshest payload — cache it.
        if (intent?.action == ACTION_START) {
          // 새 매치의 시동은 이전 매치의 병합 상한을 물려받으면 안 된다 — JS가 시동 직후
          // 다시 내려보낸다(fail-closed).
          mergeCapKm = Double.NaN
        }
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
      val responseBody = MatchUploadHttp.send(url, token, mergeDistanceIntoBody(body))
      if (responseBody != null) {
        MatchUploadResponseBus.emit(responseBody)
      }
    } catch (error: Throwable) {
      Log.w(TAG, "tick failed: ${error.message}")
    } finally {
      periodicInFlight.set(false)
    }
  }

  // 잠든 중 실시간 병합 — 재전송 직전, 캐시된 JS 페이로드의 distanceKm을 네이티브 누적
  // 총거리로 끌어올린다 (오너 2026-08-17: "잠든 중에도 실시간으로 서로 거리·페이스 업데이트").
  //
  // 규칙은 JS 병합과 동일한 안전 모형이다:
  //  - merged = max(jsKm, min(nativeKm, capKm)) — 절대 내리지 않고, 절대 골 문턱을 넘지 않는다.
  //    완주 판정은 영원히 JS 몫이다: cap = goal − tolerance − epsilon 이라 네이티브 값이
  //    서버의 reachedGoalDistance를 먼저 넘길 수 없다.
  //  - status/elapsedSeconds는 손대지 않는다. elapsed는 서버가 벽시계로 정규화하므로
  //    (resolveServerBackedElapsedSeconds) 거리만 갱신하면 상대 화면의 페이스도 맞는다.
  //  - 거리 누적 세션이 살아 있을 때만(distanceWanted) — 죽은 세션의 낡은 총거리는 안 믿는다.
  //  - 파싱 실패·필드 부재 등 모든 예외는 원본 그대로 전송(fail-open to old behavior).
  //  - 갱신이 없으면(러너가 실제로 멈춤) 원본을 바이트 그대로 재전송한다 — 서버의 정지 감지
  //    (lastLivePushSignature)가 진짜 정지를 계속 잡을 수 있어야 한다.
  private fun mergeDistanceIntoBody(body: String): String {
    val capKm = mergeCapKm
    if (!capKm.isFinite() || capKm <= 0 || !distanceWanted) {
      return body
    }

    return try {
      val json = JSONObject(body)
      val jsKm = json.optDouble("distanceKm", Double.NaN)
      if (!jsKm.isFinite()) {
        return body
      }
      val nativeKm = distanceAccumulator.totalMeters / 1000.0
      val mergedKm = Math.max(jsKm, Math.min(nativeKm, capKm))
      // 두 자리 **내림** — 반올림이 올리면 42.195 프리셋에서 상한(42.189)이 서버 완주
      // 문턱(42.190)과 같아진다. 내림은 어떤 골에서도 상한 아래에 머문다.
      val roundedKm = Math.floor(mergedKm * 100.0) / 100.0
      if (roundedKm <= jsKm) {
        return body
      }
      json.put("distanceKm", roundedKm)
      json.toString()
    } catch (error: Throwable) {
      Log.w(TAG, "merge failed: ${error.message}")
      body
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
    mergeCapKm = Double.NaN
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
    // 잠든 중 실시간 병합 설정 (매치 시동 뒤 JS가 내려보낸다; 옛 번들은 안 보냄 = 병합 꺼짐).
    const val ACTION_MERGE_CONFIG = "expo.modules.matchprogressuploader.action.MERGE_CONFIG"

    const val EXTRA_URL = "url"
    const val EXTRA_TOKEN = "token"
    const val EXTRA_BODY = "body"
    const val EXTRA_INTERVAL_MS = "intervalMs"
    const val EXTRA_MERGE_CAP_KM = "mergeCapKm"

    // Distance accumulator extras: the JS filter constants + the seed total.
    const val EXTRA_DISTANCE_SEED_METERS = "distanceSeedMeters"
    const val EXTRA_MAX_ACCURACY_METERS = "maxAccuracyMeters"
    const val EXTRA_DISTANCE_GATE_BASE_METERS = "distanceGateBaseMeters"
    const val EXTRA_DISTANCE_GATE_ACCURACY_SCALE = "distanceGateAccuracyScale"
    const val EXTRA_TELEPORT_MIN_METERS = "teleportMinMeters"
    const val EXTRA_MAX_SPEED_MPS = "maxSpeedMps"
    const val EXTRA_MAX_LOCATION_AGE_MS = "maxLocationAgeMs"

    // Later-added filter constants (the 99693a0 wire-format extension). OPTIONAL: an old JS bundle
    // never sends these keys, and each ABSENT extra leaves its native gate DISABLED — so an old
    // bundle drives this binary exactly like the previous one, while a new bundle against an old
    // binary is safe because old binaries ignore unknown extras.
    const val EXTRA_MIN_TIME_DELTA_MS = "minTimeDeltaMs"
    const val EXTRA_TELEPORT_ACCURACY_SCALE = "teleportAccuracyScale"
    const val EXTRA_TELEPORT_MAX_SPEED_MPS = "teleportMaxSpeedMps"
    const val EXTRA_STATIONARY_SPEED_MPS = "stationarySpeedMps"
    const val EXTRA_POOR_ACCURACY_METERS = "poorAccuracyMeters"
    const val EXTRA_COLD_START_STABLE_FIX_COUNT = "coldStartStableFixCount"
    const val EXTRA_COLD_START_MAX_CLUSTER_RADIUS_METERS = "coldStartMaxClusterRadiusMeters"
    const val EXTRA_COLD_START_MAX_ACCURACY_METERS = "coldStartMaxAccuracyMeters"
    const val EXTRA_COLD_START_MAX_WINDOW_MS = "coldStartMaxWindowMs"

    // Signal-loss gap ceiling (JS MAX_CREDITABLE_FIX_GAP_MS). Same OPTIONAL contract as the block
    // above: absent → no dt ceiling → the previous binary's behavior.
    const val EXTRA_MAX_CREDITABLE_FIX_GAP_MS = "maxCreditableFixGapMs"

    // Reserved overrides (no JS bundle sends these yet): the noisy-gate min-movement floor (JS
    // MIN_MOVEMENT_DISTANCE_METERS) and an explicit future-timestamp window (JS
    // MAX_FUTURE_LOCATION_MS). Absent → JS-source default 3.0 / today's symmetric age window.
    const val EXTRA_MIN_MOVEMENT_METERS = "minMovementMeters"
    const val EXTRA_MAX_FUTURE_LOCATION_MS = "maxFutureLocationMs"

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
 * the JS per-fix filter chain (src/features/runs/tracking/background/locationDistance.ts +
 * routeAccumulator.ts appendTrackedLocation) in the SAME order: accuracy + age windows, cold-start
 * warmup discard, min time delta, the signal-loss gap ceiling, both teleport gates, the
 * stationary/poor-accuracy noise rejection, and the accuracy-scaled distance gate. Only the JS
 * route-REWRITE passes (cold-start excursion collapse + mid-run lateral-jitter collapse) stay
 * JS-only — they rewrite the whole route and recompute the total from it, which needs the full
 * route history the native side does not keep. The JS merge is FRESH-JS-WINS, so this total only
 * ever fills screen-off gaps.
 *
 * Wire-format compatibility: the six original constants keep their existing extras. Every
 * LATER-ADDED constant is OPTIONAL — an absent extra leaves its gate DISABLED, so an old JS bundle
 * (which never sends the new keys) drives this binary exactly like the previous one.
 *
 * Threading: configure/seed/reset/beginSession come from onStartCommand (main thread); consume()
 * comes from the LocationCallback (main looper). totalMeters is read synchronously from the module
 * (any thread), so the total is @Volatile and advanced under a small lock — no GPS work under it.
 */
private class DistanceAccumulator {
  // Original filter constants (always in the wire format). Defaults mirror the CURRENT JS source
  // values so a missing/garbled option can never widen the gate open.
  @Volatile private var maxAccuracyMeters: Double = 40.0
  @Volatile private var distanceGateBaseMeters: Double = 3.0
  @Volatile private var distanceGateAccuracyScale: Double = 0.15
  @Volatile private var teleportMinMeters: Double = 35.0
  @Volatile private var maxSpeedMps: Double = 8.5
  @Volatile private var maxLocationAgeMs: Double = 15000.0

  // Later-added filter constants (the 99693a0 wire-format extension). null = not delivered = that
  // gate stays disabled (the previous binary's behavior, for old JS bundles).
  @Volatile private var minTimeDeltaMs: Double? = null
  @Volatile private var teleportAccuracyScale: Double? = null
  @Volatile private var teleportMaxSpeedMps: Double? = null
  @Volatile private var stationarySpeedMps: Double? = null
  @Volatile private var poorAccuracyMeters: Double? = null
  @Volatile private var coldStartStableFixCount: Int? = null
  @Volatile private var coldStartMaxClusterRadiusMeters: Double? = null
  @Volatile private var coldStartMaxAccuracyMeters: Double? = null
  @Volatile private var coldStartMaxWindowMs: Double? = null

  // Signal-loss gap ceiling (JS MAX_CREDITABLE_FIX_GAP_MS). null = not delivered = no dt ceiling.
  @Volatile private var maxCreditableFixGapMs: Double? = null

  // Reserved overrides (no JS bundle sends them yet). minMovementMeters is the noisy-gate floor
  // (JS MIN_MOVEMENT_DISTANCE_METERS); a null maxFutureLocationMs keeps today's symmetric age window.
  @Volatile private var minMovementMeters: Double = 3.0
  @Volatile private var maxFutureLocationMs: Double? = null

  // Per-fix anchors, mirroring JS: lastAppended = the route tail (advances on every fix that passes
  // the segment filters, INCLUDING sub-distance-gate ones); lastCounted = the distance-gate anchor
  // (advances only when distance is actually banked). The split is what lets a slow drift accumulate
  // against ONE counted origin while the segment filters still compare consecutive fixes — exactly
  // the JS previousPoint / lastCountedPoint pair. Touched only on the GPS-callback thread (the main
  // looper) + onStartCommand (main thread).
  private var lastAppended: Location? = null
  private var lastCounted: Location? = null

  // Cold-start warmup buffer (mirrors JS coldStartFixBuffer): fixes collected BEFORE the first
  // anchor. Once coldStartStableFixCount recent fixes form a tight cluster, the anchor is the
  // cluster's LAST fix and the intra-cluster path is banked as ZERO — the JS cold-start seed=0
  // semantics that killed the ~0.3km start spike.
  private val coldStartBuffer = ArrayList<Location>()

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

    // Later-added constants: an absent extra reads null and DISABLES its gate (old-bundle parity).
    minTimeDeltaMs = intent.readOptionalDouble(MatchUploadForegroundService.EXTRA_MIN_TIME_DELTA_MS)
    teleportAccuracyScale = intent.readOptionalDouble(MatchUploadForegroundService.EXTRA_TELEPORT_ACCURACY_SCALE)
    teleportMaxSpeedMps = intent.readOptionalDouble(MatchUploadForegroundService.EXTRA_TELEPORT_MAX_SPEED_MPS)
    stationarySpeedMps = intent.readOptionalDouble(MatchUploadForegroundService.EXTRA_STATIONARY_SPEED_MPS)
    poorAccuracyMeters = intent.readOptionalDouble(MatchUploadForegroundService.EXTRA_POOR_ACCURACY_METERS)
    coldStartStableFixCount = intent.readOptionalDouble(MatchUploadForegroundService.EXTRA_COLD_START_STABLE_FIX_COUNT)
      ?.let { raw ->
        // A count outside the buffer's reach could never form a cluster (native distance would stay
        // frozen), so a garbled value disables the warmup instead of bricking accumulation.
        val count = Math.round(raw).toInt()
        if (count in 2..COLD_START_MAX_BUFFER_FIXES) count else null
      }
    coldStartMaxClusterRadiusMeters = intent.readOptionalDouble(MatchUploadForegroundService.EXTRA_COLD_START_MAX_CLUSTER_RADIUS_METERS)
    coldStartMaxAccuracyMeters = intent.readOptionalDouble(MatchUploadForegroundService.EXTRA_COLD_START_MAX_ACCURACY_METERS)
    coldStartMaxWindowMs = intent.readOptionalDouble(MatchUploadForegroundService.EXTRA_COLD_START_MAX_WINDOW_MS)
    // A non-positive/garbled ceiling would gate EVERY fix (native distance frozen for the whole
    // run), so it disables the rule instead of bricking accumulation — same guard style as the
    // cold-start fix count above.
    maxCreditableFixGapMs = intent.readOptionalDouble(MatchUploadForegroundService.EXTRA_MAX_CREDITABLE_FIX_GAP_MS)
      ?.takeIf { it > 0 }
    minMovementMeters = intent.readOptionalDouble(MatchUploadForegroundService.EXTRA_MIN_MOVEMENT_METERS) ?: 3.0
    maxFutureLocationMs = intent.readOptionalDouble(MatchUploadForegroundService.EXTRA_MAX_FUTURE_LOCATION_MS)
  }

  // Drop the anchors + warmup buffer so the session re-runs the cold-start warmup (or, on an old
  // wire format, re-anchors on the first accepted fix — no initial jump either way). The running
  // total is PRESERVED (the JS side seeds the baseline separately).
  fun beginSession() {
    lastAppended = null
    lastCounted = null
    coldStartBuffer.clear()
  }

  // Set the running total to the JS authoritative total at start so native and JS share one origin.
  fun seed(meters: Double) {
    synchronized(lock) {
      total = if (meters.isFinite() && meters > 0) meters else 0.0
    }
  }

  // Full reset (new run): zero the total, drop the anchors + warmup buffer.
  fun reset() {
    lastAppended = null
    lastCounted = null
    coldStartBuffer.clear()
    synchronized(lock) {
      total = 0.0
    }
  }

  // Consume one delivered fix. Returns the NEW total in meters when the fix advanced the distance,
  // or null when the fix was rejected/gated. Mirrors the JS appendTrackedLocation chain in the SAME
  // order: accuracy → age window → cold-start warmup → min time delta → signal-loss gap → teleport
  // (hard + accuracy-scaled) → stationary/poor-accuracy noise → accuracy-scaled distance gate →
  // count.
  fun consume(current: Location): Double? {
    // FAIL CLOSED on missing accuracy: a fix with no accuracy value used to read as 0.0 (best
    // possible) and slide under the smallest gate. Treat it as worst — reject.
    if (!current.hasAccuracy()) {
      return null
    }
    val accuracy = current.accuracy.toDouble()
    if (accuracy < 0 || accuracy > maxAccuracyMeters) {
      return null
    }

    // Age window (JS resolveLocationTimestampMs): stale-past fixes beyond maxLocationAgeMs and
    // future-stamped fixes beyond maxFutureLocationMs are clock artifacts. An absent
    // maxFutureLocationMs keeps the previous binary's symmetric window.
    val nowMs = System.currentTimeMillis()
    if ((nowMs - current.time).toDouble() > maxLocationAgeMs) {
      return null
    }
    if ((current.time - nowMs).toDouble() > (maxFutureLocationMs ?: maxLocationAgeMs)) {
      return null
    }

    // Cold-start warmup (JS buildStableColdStartRouteCandidate + the seed=0 anchor): before the
    // first anchor, buffer fixes until a tight stable cluster forms, anchor at its LAST fix, and
    // bank NOTHING for the intra-cluster path.
    val previous = lastAppended
    if (previous == null) {
      handleColdStart(current)
      return null
    }

    val segmentMeters = previous.distanceTo(current).toDouble()
    val dtMs = (current.time - previous.time).toDouble()
    val dtSeconds = dtMs / 1000.0

    // Min time delta (JS MIN_LOCATION_TIME_DELTA_MS): sub-cadence duplicate fixes are noise.
    val activeMinTimeDeltaMs = minTimeDeltaMs
    if (activeMinTimeDeltaMs != null && dtMs < activeMinTimeDeltaMs) {
      return null
    }

    // Signal-loss gap (JS isSignalLossGapMs, routeAccumulator.ts): no valid fix for longer than the
    // ceiling means the path between the two fixes was NEVER OBSERVED — the straight chord is not
    // ours to credit. Move BOTH anchors to the re-acquired position (JS appends the point and moves
    // lastCountedPoint to it) and bank nothing, so counting resumes cleanly from there.
    //
    // MUST sit BEFORE both teleport gates, exactly like JS, for two reasons:
    //   1. They are no defense here. They are SPEED-based, and the longer the blackout the LOWER
    //      the chord's implied speed — a 3-minute tunnel crossing ~1km implies ~5.5 m/s and sails
    //      under both limits (8.5 / 5.8 m/s) and the server's limiter too.
    //   2. When a chord DOES trip one, that gate drops the fix WITHOUT moving the anchors. A gap
    //      check placed after it would never run, and every later fix would keep being compared
    //      against the stale pre-blackout anchor — distance frozen for the rest of the run.
    // Gap-first both refuses the credit AND re-anchors, so counting resumes either way.
    val activeMaxCreditableFixGapMs = maxCreditableFixGapMs
    if (activeMaxCreditableFixGapMs != null && dtMs > activeMaxCreditableFixGapMs) {
      lastAppended = current
      lastCounted = current
      return null
    }

    val lastAccuracy = if (previous.hasAccuracy()) previous.accuracy.toDouble() else 0.0
    val worstAccuracy = Math.max(Math.max(lastAccuracy, 0.0), accuracy)

    // Teleport 1 (hard — JS MIN_TELEPORT_FILTER_DISTANCE_METERS + MAX_REASONABLE_RUNNING_SPEED_MPS):
    // a long segment covered impossibly fast is a GPS jump — drop it and do NOT advance the anchor,
    // so the next in-range fix re-anchors off the last good position.
    if (segmentMeters >= teleportMinMeters && dtSeconds > 0 && (segmentMeters / dtSeconds) > maxSpeedMps) {
      return null
    }

    // Teleport 2 (accuracy-scaled): a jump longer than max(teleportMin, worstAccuracy * scale)
    // moving faster than teleportMaxSpeedMps is GPS relocation, not running.
    val activeTeleportScale = teleportAccuracyScale
    val activeTeleportMaxSpeed = teleportMaxSpeedMps
    if (
      activeTeleportScale != null && activeTeleportMaxSpeed != null && dtSeconds > 0 &&
      segmentMeters > Math.max(teleportMinMeters, worstAccuracy * activeTeleportScale) &&
      (segmentMeters / dtSeconds) > activeTeleportMaxSpeed
    ) {
      return null
    }

    // Stationary / poor-accuracy noise rejection (JS shouldIgnoreNoisySegment), including the
    // dynamic min-movement floor.
    val activeStationarySpeed = stationarySpeedMps
    val activePoorAccuracy = poorAccuracyMeters
    if (activeStationarySpeed != null && activePoorAccuracy != null) {
      val dynamicMinMovementMeters = Math.max(minMovementMeters, Math.min(4.5, worstAccuracy * 0.1))
      if (segmentMeters < dynamicMinMovementMeters) {
        return null
      }

      val segmentSpeedMps = if (dtSeconds > 0) segmentMeters / dtSeconds else Double.POSITIVE_INFINITY
      val rawSpeedMps = if (current.hasSpeed()) current.speed.toDouble() else null
      val reliableSpeedMps = rawSpeedMps?.takeIf { it >= MIN_RELIABLE_SPEED_MPS && it <= maxSpeedMps }

      val reliableLooksStationary = reliableSpeedMps != null && reliableSpeedMps < activeStationarySpeed
      val looksStationary = reliableLooksStationary || segmentSpeedMps < activeStationarySpeed
      val stationaryNoiseRadiusMeters = Math.max(4.0, Math.min(12.0, worstAccuracy * 0.35))
      if (looksStationary && segmentMeters < stationaryNoiseRadiusMeters) {
        return null
      }

      val poorAccuracyNoiseRadiusMeters = Math.min(12.0, worstAccuracy * 0.25)
      if (worstAccuracy >= activePoorAccuracy && segmentSpeedMps < 1.4 && segmentMeters < poorAccuracyNoiseRadiusMeters) {
        return null
      }
    }

    // Distance gate (JS resolveDistanceGateMeters), measured from the COUNTED anchor: below the
    // gate is jitter, not movement. Mirror JS: the fix still becomes the segment anchor (JS appends
    // it to the route) but the counted anchor stays, so a slow drift accumulates until it crosses
    // the gate from the SAME counted origin.
    val countedAnchor = lastCounted ?: previous.also { lastCounted = it }
    val gate = distanceGateBaseMeters + Math.max(0.0, worstAccuracy) * distanceGateAccuracyScale
    val distanceFromCountedMeters = countedAnchor.distanceTo(current).toDouble()

    if (distanceFromCountedMeters < gate) {
      lastAppended = current
      return null
    }

    val newTotal: Double
    synchronized(lock) {
      total += distanceFromCountedMeters
      newTotal = total
    }
    lastAppended = current
    lastCounted = current
    return newTotal
  }

  // Cold-start warmup: mirror buildStableColdStartRouteCandidate + trimColdStartFixBuffer — check
  // the LAST coldStartStableFixCount fixes for (a) a strictly-increasing window <=
  // coldStartMaxWindowMs, (b) per-fix accuracy <= coldStartMaxAccuracyMeters, and (c) a max
  // pairwise distance <= coldStartMaxClusterRadiusMeters. Stable → anchor at the cluster's last
  // fix, banking ZERO. When the cold-start constants were not delivered (old JS bundle), the first
  // accepted fix anchors directly — the previous binary's behavior.
  private fun handleColdStart(current: Location) {
    val stableFixCount = coldStartStableFixCount
    val clusterRadiusMeters = coldStartMaxClusterRadiusMeters
    val maxStableAccuracyMeters = coldStartMaxAccuracyMeters
    val maxWindowMs = coldStartMaxWindowMs
    if (stableFixCount == null || clusterRadiusMeters == null || maxStableAccuracyMeters == null || maxWindowMs == null) {
      lastAppended = current
      lastCounted = current
      return
    }

    coldStartBuffer.add(current)
    while (coldStartBuffer.size > COLD_START_MAX_BUFFER_FIXES) {
      coldStartBuffer.removeAt(0)
    }
    if (coldStartBuffer.size < stableFixCount) {
      return
    }

    val recent = coldStartBuffer.subList(coldStartBuffer.size - stableFixCount, coldStartBuffer.size)
    val windowMs = (recent.last().time - recent.first().time).toDouble()
    if (windowMs <= 0 || windowMs > maxWindowMs) {
      return
    }
    if (recent.any { it.hasAccuracy() && it.accuracy.toDouble() > maxStableAccuracyMeters }) {
      return
    }

    var maxPairDistanceMeters = 0.0
    for (leftIndex in 0 until recent.size - 1) {
      for (rightIndex in leftIndex + 1 until recent.size) {
        maxPairDistanceMeters = Math.max(
          maxPairDistanceMeters,
          recent[leftIndex].distanceTo(recent[rightIndex]).toDouble(),
        )
      }
    }
    if (maxPairDistanceMeters > clusterRadiusMeters) {
      return
    }

    // STABLE: anchor at the cluster's last fix; the intra-cluster warmup path is banked as ZERO
    // (the JS cold-start seed=0 that killed the start spike — the JS merge seeds the baseline).
    val anchor = recent.last()
    lastAppended = anchor
    lastCounted = anchor
    coldStartBuffer.clear()
  }

  private companion object {
    // JS COLD_START_MAX_BUFFER_FIXES / MIN_RELIABLE_RUNNING_SPEED_MPS — formula internals the JS
    // side also hardcodes (they are not part of the options wire format).
    const val COLD_START_MAX_BUFFER_FIXES = 8
    const val MIN_RELIABLE_SPEED_MPS = 0.7
  }
}

private fun Intent.readDouble(key: String, fallback: Double): Double {
  val value = getDoubleExtra(key, Double.NaN)
  return if (value.isFinite()) value else fallback
}

// Optional read for the later-added filter constants: an absent/garbled extra reads null, which
// DISABLES the corresponding gate — the backward-compat contract for old JS bundles.
private fun Intent.readOptionalDouble(key: String): Double? {
  val value = getDoubleExtra(key, Double.NaN)
  return if (value.isFinite()) value else null
}
