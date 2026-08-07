package expo.modules.matchprogressuploader

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import android.util.Log
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.Executors

class MatchProgressUploaderModule : Module() {
  // Single-thread executor: serializes the one-shot in-process uploads so location ticks never
  // fire overlapping requests, while keeping the HTTP work off the JS thread. The PERIODIC cadence
  // no longer lives here — it moved into MatchUploadForegroundService so it survives One UI killing
  // expo-location's foreground service.
  private val executor = Executors.newSingleThreadExecutor()

  // Bridge the foreground service's periodic re-POST responses to the JS emitter. Registered on
  // start, cleared on stop/destroy so a torn-down module never receives a stale emit.
  private val responseListener: (String) -> Unit = { body ->
    try {
      sendEvent("onMatchProgressResponse", mapOf("body" to body))
    } catch (emitError: Throwable) {
      Log.w("RGNativeUpload", "emit failed: ${emitError.message}")
    }
  }

  // Bridge the foreground service's native distance accumulator advances to the JS emitter. Mirrors
  // responseListener above. Registered on distance start, cleared on stop/destroy.
  private val distanceListener: (Double) -> Unit = { meters ->
    try {
      sendEvent("onDistanceAccumulated", mapOf("meters" to meters))
    } catch (emitError: Throwable) {
      Log.w("RGNativeUpload", "distance emit failed: ${emitError.message}")
    }
  }

  private val appContextOrNull: Context?
    get() = appContext.reactContext

  override fun definition() = ModuleDefinition {
    Name("MatchProgressUploader")

    // The emitter the native periodic re-POST fires with the 2xx response body string, so JS can
    // apply the opponent's live state WITHOUT a JS timer. onDistanceAccumulated fires with the
    // native running total in meters after a GPS fix advances the distance accumulator.
    Events("onMatchProgressResponse", "onDistanceAccumulated")

    // OTA-SAFETY availability marker — mirrors the iOS Swift module's Property("available").
    Property("available") {
      true
    }

    // NATIVE one-shot upload: resolves with the response body string (or null on non-2xx /
    // failure) so the JS background flush can apply the opponent's live state instead of throwing
    // it away. Never rejects in a way that crashes the run.
    AsyncFunction("upload") { url: String, authToken: String, jsonBody: String, promise: Promise ->
      executor.execute {
        promise.resolve(MatchUploadHttp.send(url, authToken, jsonBody))
      }
    }

    // Cache the payload + start the native cadence (now hosted by the foreground service). Gated
    // strictly to an active match by JS, so this is always called while the app is foreground and
    // the run is armed → the FGS start is NOT a background start (exempt from the Android 12+ S
    // background-FGS-start restriction).
    Function("startPeriodicUpload") { url: String, authToken: String, jsonBody: String, intervalMs: Int ->
      MatchUploadResponseBus.setListener(responseListener)
      val intervalMsClamped = if (intervalMs > 0) intervalMs.toLong() else 3000L
      startUploadService(MatchUploadForegroundService.ACTION_START, url, authToken, jsonBody, intervalMsClamped)
    }

    // Cheaply overwrite the cached payload (no thread restart) — delivered to the running service
    // as an UPDATE intent. Called by JS on EVERY snapshot commit + every bg-location tick.
    Function("updatePeriodicPayload") { url: String, authToken: String, jsonBody: String ->
      startUploadService(MatchUploadForegroundService.ACTION_UPDATE, url, authToken, jsonBody, -1L)
    }

    // Stop + clear the native cadence (match finish / forfeit / context clear / unmount).
    Function("stopPeriodicUpload") {
      stopUploadService()
    }

    // NATIVE DISTANCE ACCUMULATOR — begin GPS distance accumulation in the foreground service with
    // the JS filter constants so native mirrors JS. Wires the onDistanceAccumulated bridge so each
    // advance can reach JS. Returns true when the start intent was dispatched.
    // 화면 꺼진 완주의 기록 저장 배달 (오너 2026-08-07 네이티브 업로더 확장): JS가 골
    // 크로싱 순간 완성한 /runs/tracked 페이로드를 네이티브 스레드가 재시도하며 배달한다.
    // 서버가 (userId, startedAt) 재전송을 dedupe 하므로 이후 JS 저장과 겹쳐도 무해.
    Function("armRunSaveUpload") { url: String, authToken: String, jsonBody: String ->
      RunSaveUploader.arm(url, authToken, jsonBody)
    }

    Function("cancelRunSaveUpload") {
      RunSaveUploader.cancel()
    }

    Function("startDistanceAccumulator") { options: Map<String, Any?> ->
      MatchDistanceBus.setListener(distanceListener)
      startDistanceService(MatchUploadForegroundService.ACTION_DISTANCE_START, options)
      true
    }

    // Seed the native running total to the JS authoritative total at start so native + JS share one
    // origin (the JS merge then takes max(jsKm, nativeKm) — never a sum).
    Function("seedDistanceAccumulator") { startMeters: Double ->
      val intent = buildDistanceIntent(MatchUploadForegroundService.ACTION_DISTANCE_SEED) ?: return@Function
      intent.putExtra(MatchUploadForegroundService.EXTRA_DISTANCE_SEED_METERS, startMeters)
      dispatchServiceIntent(intent)
    }

    // SYNCHRONOUS read of the native distance total in meters, published by the service via
    // MatchDistanceBus. 0 before any accumulation. The merge calls this at flush time.
    Function("getAccumulatedDistanceMeters") {
      MatchDistanceBus.totalMeters
    }

    // Reset the native total + per-fix anchor (new run start).
    Function("resetDistanceAccumulator") {
      startDistanceService(MatchUploadForegroundService.ACTION_DISTANCE_RESET, emptyMap())
    }

    // Stop native distance accumulation + tear down the GPS consumer (match finish / forfeit /
    // context clear / unmount) so no battery is drained after the run.
    Function("stopDistanceAccumulator") {
      MatchDistanceBus.setListener(null)
      startDistanceService(MatchUploadForegroundService.ACTION_DISTANCE_STOP, emptyMap())
    }

    // BATTERY-OPT EXEMPTION — is the app currently exempt from Doze/적응형 배터리? Samsung needs an
    // explicit exemption on top of the manual exclusion the user did. Safe on every API level.
    Function("isIgnoringBatteryOptimizations") {
      isIgnoringBatteryOptimizations()
    }

    // Fire the system "ignore battery optimizations" request dialog for THIS package. Returns true
    // if the intent was dispatched, false if unavailable (no activity / unsupported API). Never
    // throws into JS.
    Function("requestIgnoreBatteryOptimizations") {
      requestIgnoreBatteryOptimizations()
    }

    OnDestroy {
      MatchUploadResponseBus.setListener(null)
      MatchDistanceBus.setListener(null)
      // Do NOT stop the service here on a routine reload — but DO shut down the in-process
      // executor. The service is stopped explicitly via stopPeriodicUpload on match end.
      executor.shutdownNow()
    }
  }

  // Dispatch a distance-accumulator service intent carrying the JS filter constants (for START) or
  // nothing extra (RESET/STOP). Mirrors startUploadService. Best-effort: never throws into JS.
  private fun startDistanceService(action: String, options: Map<String, Any?>) {
    val intent = buildDistanceIntent(action) ?: return
    if (action == MatchUploadForegroundService.ACTION_DISTANCE_START) {
      putDistanceOption(intent, MatchUploadForegroundService.EXTRA_MAX_ACCURACY_METERS, options["maxAccuracyMeters"])
      putDistanceOption(intent, MatchUploadForegroundService.EXTRA_DISTANCE_GATE_BASE_METERS, options["distanceGateBaseMeters"])
      putDistanceOption(intent, MatchUploadForegroundService.EXTRA_DISTANCE_GATE_ACCURACY_SCALE, options["distanceGateAccuracyScale"])
      putDistanceOption(intent, MatchUploadForegroundService.EXTRA_TELEPORT_MIN_METERS, options["teleportMinMeters"])
      putDistanceOption(intent, MatchUploadForegroundService.EXTRA_MAX_SPEED_MPS, options["maxSpeedMps"])
      putDistanceOption(intent, MatchUploadForegroundService.EXTRA_MAX_LOCATION_AGE_MS, options["maxLocationAgeMs"])
      // Later-added filter constants (99693a0 wire-format extension). putDistanceOption skips a
      // missing key, so an OLD JS bundle (which never sends these) leaves the extras absent and the
      // service keeps those gates disabled — the previous binary's behavior, byte-for-byte.
      putDistanceOption(intent, MatchUploadForegroundService.EXTRA_MIN_TIME_DELTA_MS, options["minTimeDeltaMs"])
      putDistanceOption(intent, MatchUploadForegroundService.EXTRA_TELEPORT_ACCURACY_SCALE, options["teleportAccuracyScale"])
      putDistanceOption(intent, MatchUploadForegroundService.EXTRA_TELEPORT_MAX_SPEED_MPS, options["teleportMaxSpeedMps"])
      putDistanceOption(intent, MatchUploadForegroundService.EXTRA_STATIONARY_SPEED_MPS, options["stationarySpeedMps"])
      putDistanceOption(intent, MatchUploadForegroundService.EXTRA_POOR_ACCURACY_METERS, options["poorAccuracyMeters"])
      putDistanceOption(intent, MatchUploadForegroundService.EXTRA_COLD_START_STABLE_FIX_COUNT, options["coldStartStableFixCount"])
      putDistanceOption(intent, MatchUploadForegroundService.EXTRA_COLD_START_MAX_CLUSTER_RADIUS_METERS, options["coldStartMaxClusterRadiusMeters"])
      putDistanceOption(intent, MatchUploadForegroundService.EXTRA_COLD_START_MAX_ACCURACY_METERS, options["coldStartMaxAccuracyMeters"])
      putDistanceOption(intent, MatchUploadForegroundService.EXTRA_COLD_START_MAX_WINDOW_MS, options["coldStartMaxWindowMs"])
      // Reserved overrides — no JS bundle sends these yet; forwarded so a future OTA can deliver
      // them without another native build.
      putDistanceOption(intent, MatchUploadForegroundService.EXTRA_MIN_MOVEMENT_METERS, options["minMovementMeters"])
      putDistanceOption(intent, MatchUploadForegroundService.EXTRA_MAX_FUTURE_LOCATION_MS, options["maxFutureLocationMs"])
    }
    dispatchServiceIntent(intent)
  }

  private fun putDistanceOption(intent: Intent, key: String, value: Any?) {
    val asDouble = when (value) {
      is Double -> value
      is Float -> value.toDouble()
      is Int -> value.toDouble()
      is Long -> value.toDouble()
      is Number -> value.toDouble()
      else -> return
    }
    intent.putExtra(key, asDouble)
  }

  private fun buildDistanceIntent(action: String): Intent? {
    val context = appContextOrNull ?: return null
    return Intent(context, MatchUploadForegroundService::class.java).apply {
      this.action = action
    }
  }

  // Dispatch a built service intent (foreground-start on O+ for START which promotes the FGS; plain
  // start for SEED/RESET/STOP which only message an already-running service). Best-effort.
  private fun dispatchServiceIntent(intent: Intent) {
    val context = appContextOrNull ?: return
    try {
      if (intent.action == MatchUploadForegroundService.ACTION_DISTANCE_START
        && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.startForegroundService(intent)
      } else {
        context.startService(intent)
      }
    } catch (error: Throwable) {
      Log.w("RGNativeUpload", "distance service dispatch failed: ${error.message}")
    }
  }

  private fun startUploadService(
    action: String,
    url: String,
    authToken: String,
    jsonBody: String,
    intervalMs: Long,
  ) {
    val context = appContextOrNull ?: return
    try {
      val intent = Intent(context, MatchUploadForegroundService::class.java).apply {
        this.action = action
        putExtra(MatchUploadForegroundService.EXTRA_URL, url)
        putExtra(MatchUploadForegroundService.EXTRA_TOKEN, authToken)
        putExtra(MatchUploadForegroundService.EXTRA_BODY, jsonBody)
        if (intervalMs > 0L) {
          putExtra(MatchUploadForegroundService.EXTRA_INTERVAL_MS, intervalMs)
        }
      }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.startForegroundService(intent)
      } else {
        context.startService(intent)
      }
    } catch (error: Throwable) {
      // Best-effort: a failure to start leaves the JS-timer + location-task fallback in place.
      Log.w("RGNativeUpload", "startUploadService failed: ${error.message}")
    }
  }

  private fun stopUploadService() {
    MatchUploadResponseBus.setListener(null)
    val context = appContextOrNull ?: return
    try {
      val intent = Intent(context, MatchUploadForegroundService::class.java).apply {
        action = MatchUploadForegroundService.ACTION_STOP
      }
      // startService on a stop action lets the service handle ACTION_STOP and tear itself down
      // (release wakelock + stopForeground + stopSelf). On O+ a started FGS can still receive this.
      context.startService(intent)
    } catch (error: Throwable) {
      Log.w("RGNativeUpload", "stopUploadService failed: ${error.message}")
    }
  }

  private fun isIgnoringBatteryOptimizations(): Boolean {
    val context = appContextOrNull ?: return false
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
      // Pre-Doze devices have no battery-optimization concept → treat as exempt.
      return true
    }
    return try {
      val powerManager = context.getSystemService(Context.POWER_SERVICE) as? PowerManager ?: return false
      powerManager.isIgnoringBatteryOptimizations(context.packageName)
    } catch (error: Throwable) {
      Log.w("RGNativeUpload", "isIgnoringBatteryOptimizations failed: ${error.message}")
      false
    }
  }

  private fun requestIgnoreBatteryOptimizations(): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
      return false
    }
    val context = appContextOrNull ?: return false
    val activity = appContext.currentActivity
    return try {
      val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
        data = Uri.parse("package:${context.packageName}")
      }
      if (activity != null) {
        activity.startActivity(intent)
      } else {
        // No activity (e.g. invoked from background) — start with NEW_TASK so it can launch.
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
      }
      true
    } catch (error: Throwable) {
      // No activity to resolve the intent, or OEM removed the screen — caller falls back to the
      // app-settings deep link in JS.
      Log.w("RGNativeUpload", "requestIgnoreBatteryOptimizations failed: ${error.message}")
      false
    }
  }
}
