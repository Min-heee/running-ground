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

  /**
   * sendForStatus — 러닝 기록 저장(run-save) 배달용. 본문 대신 HTTP 상태코드를 돌려줘서
   * 재시도 루프가 "응답이 도착했는가(2xx 성공 / 4xx 결정적 거절 = 중단)"와 "전송 자체가
   * 실패했는가(-1 = 재시도)"를 구분한다.
   */
  fun sendForStatus(url: String, authToken: String, jsonBody: String): Int {
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
        Log.i(TAG, "POST(save) $code $url")
        // 스트림을 소비해 커넥션을 정리한다 — 본문 내용 자체는 쓰지 않는다.
        (if (code in 200..299) conn.inputStream else conn.errorStream)?.use { it.readBytes() }
        code
      } finally {
        conn.disconnect()
      }
    } catch (error: Throwable) {
      Log.w(TAG, "save upload failed: ${error.message}")
      -1
    }
  }
}
