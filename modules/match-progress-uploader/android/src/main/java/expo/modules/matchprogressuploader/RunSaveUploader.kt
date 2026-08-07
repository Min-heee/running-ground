package expo.modules.matchprogressuploader

import android.util.Log
import java.util.concurrent.atomic.AtomicInteger

/**
 * RunSaveUploader — 화면 꺼진 완주(hands-free finish)의 "기록 저장" 배달원.
 *
 * 완주(골 크로싱) 순간 JS가 완성해 맡긴 /runs/tracked 저장 페이로드를, JS가 다시
 * 정지되어도 네이티브 스레드가 재시도하며 서버에 배달한다. 절대 아무 것도 재계산하지
 * 않는다 — JS가 만든 몸통을 그대로 보낼 뿐이다 (이 모듈의 기존 원칙과 동일).
 *
 * 안전 계약:
 *  - 서버는 같은 (userId, startedAt) 재전송을 중복이 아니라 기존 행 반환/업그레이드로
 *    처리하므로, 유저가 나중에 앱을 열어 JS 저장이 또 나가도 이중 기록이 안 된다.
 *  - 2xx = 저장 완료, 4xx = 결정적 거절(재시도 무의미 — JS 저장 대기열이 이어받는다)
 *    → 중단. 전송 실패/5xx → 백오프 재시도.
 *  - cancel()은 세대 카운터를 올려 진행 중인 루프를 다음 체크포인트에서 끝낸다
 *    (JS 저장이 먼저 성공했을 때 불필요한 재전송을 줄이는 용도 — 놓쳐도 무해).
 */
internal object RunSaveUploader {
  private const val TAG = "RGNativeRunSave"
  private val generation = AtomicInteger(0)
  private val retryDelaysMs = longArrayOf(0L, 5_000L, 15_000L, 30_000L, 60_000L)

  fun arm(url: String, authToken: String, jsonBody: String) {
    val myGeneration = generation.incrementAndGet()

    Thread {
      for (delayMs in retryDelaysMs) {
        if (delayMs > 0L) {
          try {
            Thread.sleep(delayMs)
          } catch (_: InterruptedException) {
            return@Thread
          }
        }
        if (generation.get() != myGeneration) {
          return@Thread // 취소됐거나 더 새 페이로드가 대체함
        }

        val code = MatchUploadHttp.sendForStatus(url, authToken, jsonBody)
        if (code in 200..299) {
          Log.i(TAG, "run save delivered ($code)")
          return@Thread
        }
        if (code in 400..499) {
          Log.w(TAG, "run save rejected ($code) — giving up, JS queue will retry")
          return@Thread
        }
        // 전송 실패(-1)/5xx → 다음 딜레이로 재시도.
      }
      Log.w(TAG, "run save exhausted retries — JS queue will retry on next app open")
    }.apply {
      name = "RGRunSaveUploader"
      isDaemon = true
    }.start()
  }

  fun cancel() {
    generation.incrementAndGet()
  }
}
