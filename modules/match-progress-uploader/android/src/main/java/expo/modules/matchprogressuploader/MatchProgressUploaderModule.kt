package expo.modules.matchprogressuploader

import android.util.Log
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

class MatchProgressUploaderModule : Module() {
  // Single-thread executor: serializes background uploads so location ticks never fire
  // overlapping requests, while keeping the HTTP work off the JS thread.
  private val executor = Executors.newSingleThreadExecutor()

  override fun definition() = ModuleDefinition {
    Name("MatchProgressUploader")

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
