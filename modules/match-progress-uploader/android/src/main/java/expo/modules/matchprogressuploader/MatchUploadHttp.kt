package expo.modules.matchprogressuploader

import android.util.Log
import java.net.HttpURLConnection
import java.net.URL

/**
 * MatchUploadHttp — the single shared POST used by BOTH the in-process AsyncFunction("upload")
 * and the foreground-service periodic re-POST loop, so there is exactly one place that knows how
 * to talk to the backend.
 *
 * Returns the 2xx response body string (so JS can apply the opponent's live state) or null on any
 * non-2xx / failure (the next tick re-sends fresher progress).
 */
internal object MatchUploadHttp {
  private const val TAG = "RGNativeUpload"

  fun send(url: String, authToken: String, jsonBody: String): String? {
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
        Log.i(TAG, "POST $code $url")
        val stream = if (code in 200..299) conn.inputStream else conn.errorStream
        val body = stream?.use { String(it.readBytes(), Charsets.UTF_8) }
        // Only hand back a body the JS side can apply; non-2xx bodies are diagnostics, not state.
        if (code in 200..299) body else null
      } finally {
        conn.disconnect()
      }
    } catch (error: Throwable) {
      // Best-effort: the next location tick / periodic tick sends fresher progress.
      Log.w(TAG, "upload failed: ${error.message}")
      null
    }
  }
}
