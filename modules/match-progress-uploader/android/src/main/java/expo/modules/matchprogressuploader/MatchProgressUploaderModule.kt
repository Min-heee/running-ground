package expo.modules.matchprogressuploader

import android.util.Log
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicReference

class MatchProgressUploaderModule : Module() {
  private data class UploadJob(val url: String, val token: String, val body: String)

  private val executor = Executors.newSingleThreadExecutor()
  private val pending = AtomicReference<UploadJob?>(null)

  @Volatile private var draining = false

  override fun definition() = ModuleDefinition {
    Name("MatchProgressUploader")

    Function("upload") { url: String, authToken: String, jsonBody: String ->
      pending.set(UploadJob(url, authToken, jsonBody))
      kick()
    }
  }

  @Synchronized
  private fun kick() {
    if (draining) return
    draining = true
    executor.execute { drainLoop() }
  }

  private fun drainLoop() {
    while (true) {
      val job = pending.getAndSet(null) ?: break

      try {
        send(job)
      } catch (error: Throwable) {
        // Best-effort: the next location tick sends fresher progress.
        Log.w("RGNativeUpload", "upload failed: ${error.message}")
      }
    }

    synchronized(this) { draining = false }

    if (pending.get() != null) {
      kick()
    }
  }

  private fun send(job: UploadJob) {
    val conn = (URL(job.url).openConnection() as HttpURLConnection).apply {
      requestMethod = "POST"
      doOutput = true
      connectTimeout = 15000
      readTimeout = 15000
      setRequestProperty("Accept", "application/json")
      setRequestProperty("Content-Type", "application/json")
      setRequestProperty("Authorization", "Bearer ${job.token}")
    }

    try {
      conn.outputStream.use { it.write(job.body.toByteArray(Charsets.UTF_8)) }
      val code = conn.responseCode
      Log.i("RGNativeUpload", "POST $code ${job.url}")
      val stream = if (code in 200..299) conn.inputStream else conn.errorStream
      stream?.use { it.readBytes() }
    } finally {
      conn.disconnect()
    }
  }
}
