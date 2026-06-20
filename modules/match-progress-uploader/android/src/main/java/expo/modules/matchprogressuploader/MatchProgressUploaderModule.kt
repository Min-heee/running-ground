package expo.modules.matchprogressuploader

import android.util.Log
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

class MatchProgressUploaderModule : Module() {
  // Single-thread executor: serializes the one-shot background uploads so location ticks never
  // fire overlapping requests, while keeping the HTTP work off the JS thread.
  private val executor = Executors.newSingleThreadExecutor()

  // NATIVE PERIODIC UPLOADER — the GPS+JS-independent wall-clock cadence that re-sends the latest
  // JS-built payload while the screen is off. The app already runs an expo-location FOREGROUND
  // SERVICE during a live run (isAndroidForegroundServiceEnabled in app.json), which keeps CPU +
  // network alive screen-off, so this scheduled executor ticks in TRUE background.
  private var scheduler: ScheduledExecutorService? = null
  private var scheduledTask: ScheduledFuture<*>? = null
  // The native single-flight: a tick never overlaps an in-flight POST. Mirrors the JS
  // inFlightBackgroundMatchProgressSync lock — if a POST is still running when the next tick
  // fires, that tick is dropped (the next tick re-sends the freshest payload anyway).
  private val periodicInFlight = AtomicBoolean(false)

  // The latest JS-built payload. @Volatile so updatePeriodicPayload (called on every snapshot
  // commit + bg-location tick from the JS thread) is visible to the scheduler thread without a
  // lock. The native side NEVER recomputes distance/pace/elapsed — it only re-sends this body.
  @Volatile private var periodicUrl: String? = null
  @Volatile private var periodicToken: String? = null
  @Volatile private var periodicBody: String? = null

  override fun definition() = ModuleDefinition {
    Name("MatchProgressUploader")

    // The emitter the native periodic re-POST fires with the 2xx response body string, so JS can
    // apply the opponent's live state WITHOUT a JS timer.
    Events("onMatchProgressResponse")

    // OTA-SAFETY availability marker — mirrors the iOS Swift module's Property("available").
    // The JS availability gate keys iOS off this property so the current iOS no-op binary (which
    // lacks it) stays on the JS fetch fallback. Android already reports available via the non-null
    // module proxy, so this is here for cross-platform symmetry / future tightening; it is a no-op
    // for the currently-installed APK (native ships in the binary, not via OTA).
    Property("available") {
      true
    }

    // NATIVE (Android, next build): was a fire-and-forget Function that discarded the response.
    // Now an AsyncFunction that resolves with the response body string the request already
    // reads (or null on non-2xx / failure) so the JS background flush can apply the opponent's
    // live state instead of throwing it away. Never rejects in a way that crashes the run:
    // any non-2xx or exception resolves null and the next location tick retries.
    AsyncFunction("upload") { url: String, authToken: String, jsonBody: String, promise: Promise ->
      executor.execute {
        promise.resolve(send(url, authToken, jsonBody))
      }
    }

    // Cache the payload + start the native cadence. Gated strictly to an active match by JS.
    Function("startPeriodicUpload") { url: String, authToken: String, jsonBody: String, intervalMs: Int ->
      startPeriodic(url, authToken, jsonBody, intervalMs)
    }

    // Cheaply overwrite the cached payload (no thread restart). Called by JS on EVERY snapshot
    // commit + every bg-location tick so the native re-POST always carries the freshest body.
    Function("updatePeriodicPayload") { url: String, authToken: String, jsonBody: String ->
      periodicUrl = url
      periodicToken = authToken
      periodicBody = jsonBody
    }

    // Stop + clear the native cadence (match finish / forfeit / context clear / unmount).
    Function("stopPeriodicUpload") {
      stopPeriodic()
    }

    // Stop the cadence if the module is torn down so the scheduler can never leak.
    OnDestroy {
      stopPeriodic()
      executor.shutdownNow()
    }
  }

  @Synchronized
  private fun startPeriodic(url: String, authToken: String, jsonBody: String, intervalMs: Int) {
    periodicUrl = url
    periodicToken = authToken
    periodicBody = jsonBody

    // Already running: the payload above was refreshed, so just keep the existing cadence.
    if (scheduledTask != null) {
      return
    }

    val intervalMsClamped = if (intervalMs > 0) intervalMs.toLong() else 3000L
    val activeScheduler = scheduler ?: Executors.newSingleThreadScheduledExecutor().also { scheduler = it }
    periodicInFlight.set(false)
    scheduledTask = activeScheduler.scheduleWithFixedDelay({
      tickPeriodic()
    }, intervalMsClamped, intervalMsClamped, TimeUnit.MILLISECONDS)
  }

  private fun tickPeriodic() {
    val url = periodicUrl
    val token = periodicToken
    val body = periodicBody
    if (url == null || token == null || body == null) {
      return
    }

    // Native single-flight: skip this tick if a POST is still in flight so a tick never overlaps
    // an in-flight request (the JS analog of inFlightBackgroundMatchProgressSync). The next tick
    // re-sends the freshest payload anyway.
    if (!periodicInFlight.compareAndSet(false, true)) {
      return
    }

    try {
      val responseBody = send(url, token, body)
      // On a 2xx, emit the body so JS applies the opponent board WITHOUT a JS timer. send()
      // returns null on non-2xx / failure, so the emit fires only when there is state to apply.
      if (responseBody != null) {
        try {
          sendEvent("onMatchProgressResponse", mapOf("body" to responseBody))
        } catch (emitError: Throwable) {
          Log.w("RGNativeUpload", "emit failed: ${emitError.message}")
        }
      }
    } finally {
      periodicInFlight.set(false)
    }
  }

  @Synchronized
  private fun stopPeriodic() {
    scheduledTask?.cancel(false)
    scheduledTask = null
    scheduler?.shutdownNow()
    scheduler = null
    periodicInFlight.set(false)
    periodicUrl = null
    periodicToken = null
    periodicBody = null
  }

  private fun send(url: String, authToken: String, jsonBody: String): String? {
    return try {
      val conn = (URL(url).openConnection() as HttpURLConnection).apply {
        requestMethod = "POST"
        doOutput = true
        connectTimeout = 15000
        readTimeout = 15000
        setRequestProperty("Accept", "application/json")
        setRequestProperty("Content-Type", "application/json")
        setRequestProperty("Authorization", "Bearer $authToken")
      }

      try {
        conn.outputStream.use { it.write(jsonBody.toByteArray(Charsets.UTF_8)) }
        val code = conn.responseCode
        Log.i("RGNativeUpload", "POST $code $url")
        val stream = if (code in 200..299) conn.inputStream else conn.errorStream
        val body = stream?.use { String(it.readBytes(), Charsets.UTF_8) }
        // Only hand back a body the JS side can apply; non-2xx bodies are diagnostics, not state.
        if (code in 200..299) body else null
      } finally {
        conn.disconnect()
      }
    } catch (error: Throwable) {
      // Best-effort: the next location tick sends fresher progress.
      Log.w("RGNativeUpload", "upload failed: ${error.message}")
      null
    }
  }
}
