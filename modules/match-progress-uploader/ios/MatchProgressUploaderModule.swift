import ExpoModulesCore
import Foundation
import CoreLocation
import UIKit

// REAL iOS uploader — mirrors the Android Kotlin MatchProgressUploaderModule's behavior.
//
// Parity with Kotlin (read both files together):
//   - Same Expo Module Name("MatchProgressUploader") the JS resolves via requireNativeModule.
//   - Same AsyncFunction("upload") with the SAME argument order/shape: (url, authToken, jsonBody).
//   - Performs the HTTP POST on a background URLSession OFF the JS thread (URLSession's completion
//     handler runs on its own delegate queue), mirroring Kotlin's single-thread Executor.
//   - Forwards the SAME request shape: POST, Accept: application/json, Content-Type:
//     application/json, Authorization: "Bearer <authToken>", body = jsonBody as UTF-8.
//   - SAME 15s timeout as Kotlin (connectTimeout/readTimeout 15000ms → URLRequest.timeoutInterval
//     15 + URLSessionConfiguration timeouts 15s).
//   - Resolves with ONLY the 2xx response body string; non-2xx or any error resolves nil — exactly
//     like Kotlin's `if (code in 200..299) body else null` and its catch returning null. Never
//     rejects in a way that would crash the run; the next location tick retries.
//
// NATIVE PERIODIC UPLOADER (iOS — CLLocationManager-backed, JS-independent).
//
// WHY a SECOND, module-owned CLLocationManager: iOS has NO fixed-cadence wall-clock background timer
// (Android's ScheduledExecutorService has no iOS analog). When the screen is off, iOS aggressively
// THROTTLES JS execution, so the existing JS-driven re-POST path (expo-location callback →
// uploadMatchProgressNative) fires too infrequently and the opponent board diverges on real
// devices. The ONLY lever iOS gives a backgrounded app for JS-independent periodic work is a
// background LOCATION session: with the UIBackgroundModes:location entitlement, Core Location keeps
// delivering fixes (and runs our delegate) even while JS is throttled. So we re-POST the latest
// cached JS-built payload on each location delivery, rate-limited to ~intervalMs. This is purely a
// re-POST trigger — the native side NEVER recomputes distance/pace/elapsed; it re-sends the exact
// jsonBody JS handed it (JS stays the single source of truth), mirroring the Android module.
//
// THREE SAFETY GUARANTEES (the prior review's blockers):
//   1. COMPILE — Foundation/CoreFoundation only for time. We throttle with
//      `CFAbsoluteTimeGetCurrent()` (re-exported by Foundation), NOT CACurrentMediaTime/QuartzCore.
//      Imports are exactly the three we use: ExpoModulesCore, Foundation, CoreLocation.
//   2. AUTHORIZATION / CRASH-SAFETY — we only set allowsBackgroundLocationUpdates=true when
//      authorizationStatus == .authorizedAlways (setting it without Always + the location bg mode
//      crashes). With .authorizedWhenInUse we still start updates (foreground/while-in-use re-POSTs)
//      but never flip the bg flag. With any other status (notDetermined/denied/restricted) the
//      periodic path no-ops entirely — it can never crash.
//   3. BATTERY / LIFECYCLE — the CLLocationManager exists ONLY between startPeriodicUpload and
//      stopPeriodicUpload (one active match). stopPeriodicUpload (and module deinit) fully tears it
//      down: stopUpdatingLocation, clear delegate, release the manager, and clear the cached
//      payload. A single periodicInFlight flag (mirrors the Android AtomicBoolean) prevents
//      overlapping POSTs.
//
// OTA-SAFETY: this build sets the `available` property to true so
// isNativeMatchProgressUploaderAvailable() returns true on iOS for the NEW binary. The OLD no-op
// Swift binary does not define `available`, so it stays unavailable and keeps the JS fetch path.
//
// TERMINAL SELF-STOP (hands-free finish Stage 5, items 1+2). Today a screen-off FINISH rides this
// cadence until the server ACKs, but only JS (woken by GPS deliveries) observes the ACK — so the
// cadence and this module's CLLocationManager keep running until foreground. Fix: JS marks the
// FINISHED payload TERMINAL via markPeriodicPayloadTerminal (a NEW fn — see the OTA notes there);
// when a re-POST of a terminal-marked payload gets a terminal server response (2xx, or a definitive
// 404/410 — the exact status set the JS pending-finish path treats as terminal), the module stops
// its own cadence, the shared CLLocationManager, and the distance accumulator, without JS. An OLD
// JS bundle never marks a payload → the flag stays false → this binary behaves exactly like the
// previous one (JS performs every stop). The JS observation/stop path is unchanged as the fallback:
// every 2xx response body is still emitted to JS exactly as before.
public class MatchProgressUploaderModule: Module {
  // Mirror Kotlin's 15_000ms connect/read timeouts.
  private static let timeoutSeconds: TimeInterval = 15

  // Default native cadence (matches the Android default) when JS passes a non-positive interval.
  private static let defaultIntervalMs: Int = 3000

  // 기록 저장 총 전송 예산 — 다운샘플(1500점) 경로가 실린 최대 바디를 느린 회선에서도
  // 보낼 수 있게. 요청 유휴 타임아웃(15s)은 그대로라 죽은 연결은 여전히 빨리 끊긴다.
  private static let runSaveResourceTimeoutSeconds: TimeInterval = 120

  // Dedicated background URLSession so the POST runs off the JS thread, mirroring Kotlin's
  // single-thread Executor. Timeouts applied at both the request and session level.
  // lazy 제거 (적대 리뷰 2026-08-07): Swift의 lazy var는 스레드 안전하지 않은데 이 세션은
  // Expo 디스패치 큐 / 메인 스레드(periodic) / runSaveQueue 세 곳에서 접근된다.
  private let session: URLSession = {
    let configuration = URLSessionConfiguration.default
    configuration.timeoutIntervalForRequest = MatchProgressUploaderModule.timeoutSeconds
    configuration.timeoutIntervalForResource = MatchProgressUploaderModule.timeoutSeconds
    configuration.waitsForConnectivity = false
    return URLSession(configuration: configuration)
  }()

  // 기록 저장 전용 세션 (적대 리뷰 2026-08-07): 진행 페이로드용 세션의
  // timeoutIntervalForResource=15s는 '총 전송 시간' 캡이라, 경로가 실린 큰 저장 바디가
  // 느린 회선에서 매 시도 같은 이유로 타임아웃돼 사다리 전체가 결정적으로 소진된다.
  // 요청 유휴 타임아웃은 15s 그대로 두고 총 전송 예산만 넉넉히 준다 (Kotlin의
  // HttpURLConnection은 애초에 총 캡이 없어 플랫폼 비대칭이기도 했다).
  private let runSaveSession: URLSession = {
    let configuration = URLSessionConfiguration.default
    configuration.timeoutIntervalForRequest = MatchProgressUploaderModule.timeoutSeconds
    configuration.timeoutIntervalForResource = MatchProgressUploaderModule.runSaveResourceTimeoutSeconds
    configuration.waitsForConnectivity = false
    return URLSession(configuration: configuration)
  }()

  // The CLLocationManager-backed periodic re-POST trigger. Created in startPeriodicUpload, fully
  // torn down in stopPeriodicUpload / deinit. The locationDelegate retains the manager + holds the
  // cached payload, throttle state and single-flight flag; all of its mutable state is serialized
  // on the main thread (Core Location delivers callbacks on the thread whose run loop it was started
  // on — here the main thread), so no extra locking is needed.
  private var locationDriver: PeriodicLocationDriver?

  // Native distance accumulator — fed from the SAME PeriodicLocationDriver's didUpdateLocations (no
  // new CLLocationManager / no new stream). Lives on the module (not the driver) so its total
  // survives a driver restart and is readable synchronously via getAccumulatedDistanceMeters even
  // when only the periodic re-POST started the driver. All its mutable state is touched on the main
  // thread (where Core Location delivers callbacks), matching the driver's threading model — except
  // the synchronous totalMeters read, which is a single atomic Double load (see DistanceAccumulator).
  private let distanceAccumulator = DistanceAccumulator()

  // Reference-count which consumers need the shared location driver alive. The driver is torn down
  // only when BOTH the periodic re-POST and the distance accumulator are stopped, so stopping one
  // never starves the other. Touched only on the main thread.
  private var periodicWantsLocation = false
  private var distanceWantsLocation = false

  public func definition() -> ModuleDefinition {
    Name("MatchProgressUploader")

    // The emitter the native periodic re-POST fires with the 2xx response body string, so JS can
    // apply the opponent's live state WITHOUT a JS timer (mirrors the Android module).
    // onDistanceAccumulated fires with the native running total in meters after a GPS fix advances
    // the distance accumulator (so distance keeps moving while JS is suspended).
    Events("onMatchProgressResponse", "onDistanceAccumulated")

    // OTA-SAFETY availability marker (see index.ts). Only the REAL module exposes this; the old
    // no-op binary does not, so iOS availability stays false there.
    Property("available") {
      true
    }

    // Mirrors Kotlin's AsyncFunction("upload") { url, authToken, jsonBody, promise -> ... }.
    AsyncFunction("upload") { (url: String, authToken: String, jsonBody: String, promise: Promise) in
      self.send(url: url, authToken: authToken, jsonBody: jsonBody) { body, _ in
        promise.resolve(body)
      }
    }

    // Cache the payload + start the native location-driven cadence. Gated strictly to an active
    // match by JS. Marshalled to the main thread so the CLLocationManager is created/started on a
    // thread with a live run loop (required for delegate callbacks).
    Function("startPeriodicUpload") { (url: String, authToken: String, jsonBody: String, intervalMs: Int) in
      self.runOnMain {
        self.startPeriodic(url: url, authToken: authToken, jsonBody: jsonBody, intervalMs: intervalMs)
      }
    }

    // Cheaply overwrite the cached payload (no session restart). Called by JS on EVERY snapshot
    // commit + every bg-location tick so the native re-POST always carries the freshest body.
    Function("updatePeriodicPayload") { (url: String, authToken: String, jsonBody: String) in
      self.runOnMain {
        self.locationDriver?.updatePayload(url: url, authToken: authToken, jsonBody: jsonBody)
      }
    }

    // Stop + clear the native cadence (match finish / forfeit / context clear / unmount).
    Function("stopPeriodicUpload") {
      self.runOnMain {
        self.stopPeriodic()
      }
    }

    // TERMINAL SELF-STOP (Stage 5) — mark the CURRENTLY CACHED periodic payload TERMINAL (a
    // finished body whose successful delivery ends this runner's match). Once marked, a terminal
    // server response to a re-POST of that payload (2xx / 404 / 410) makes the module self-stop
    // the cadence AND the distance accumulator without waiting for JS (see maybePost).
    // startPeriodicUpload/updatePeriodicPayload RESET the mark (a fresher unmarked payload is by
    // definition non-terminal — a superseding match's running payload can never inherit it), so JS
    // re-marks right after every terminal payload handoff; both calls marshal through the SAME
    // main queue, so the mark always lands on the payload it was issued for.
    // OTA-SAFETY: NEW fn on this binary only. An OLD JS bundle never calls it → the mark stays
    // false → this binary behaves exactly like the previous one (JS performs every stop). A NEW JS
    // bundle on an OLD binary is safe because its wrapper `typeof`-gates the call (index.ts).
    Function("markPeriodicPayloadTerminal") {
      self.runOnMain {
        self.locationDriver?.markPayloadTerminal()
      }
    }

    // 화면 꺼진 완주의 기록 저장 배달 (오너 2026-08-07 네이티브 업로더 확장): JS가 골
    // 크로싱 순간 완성한 /runs/tracked 페이로드를, JS가 다시 정지돼도 네이티브가
    // 재시도(0/5/15/30/60s)하며 배달한다. 아무 것도 재계산하지 않는다 — JS 몸통 그대로.
    // 서버가 (userId, startedAt) 재전송을 dedupe 하므로 이후 JS 저장과 겹쳐도 무해.
    // 2xx = 완료, 4xx = 결정적 거절(중단 — JS 저장 대기열이 이어받음), 그 외 = 재시도.
    Function("armRunSaveUpload") { (url: String, authToken: String, jsonBody: String) in
      self.armRunSave(url: url, authToken: authToken, jsonBody: jsonBody)
    }

    Function("cancelRunSaveUpload") {
      self.runSaveQueue.async {
        self.runSaveGeneration += 1
      }
      self.endRunSaveBackgroundTask()
    }

    // MARK: Native distance accumulator (screen-off distance advance)

    // Begin native GPS distance accumulation, wiring the SAME location driver that already runs the
    // periodic re-POST (no new CLLocationManager / no new stream). The filter constants mirror JS
    // 1:1. start resets the per-fix anchors so the session re-runs the cold-start warmup (fixes
    // anchor only after a stable cluster; no distance is banked for the warmup wobble) — the JS
    // merge seeds the total separately via seedDistanceAccumulator. Returns true when the native
    // accumulator started (the JS side only relies on the availability gate, but this mirrors the
    // periodic surface's start/stop shape).
    Function("startDistanceAccumulator") { (options: [String: Any]) -> Bool in
      self.runOnMain {
        self.startDistanceAccumulator(options: options)
      }
      return true
    }

    // Set the native running total to the given meters (the JS authoritative total at start) so
    // native and JS share ONE origin. start has already reset last=nil, so the next fix anchors
    // without adding a jump.
    Function("seedDistanceAccumulator") { (startMeters: Double) in
      self.runOnMain {
        self.distanceAccumulator.seed(meters: startMeters)
      }
    }

    // SYNCHRONOUS read of the native distance total in meters. Returns 0 before any accumulation.
    Function("getAccumulatedDistanceMeters") { () -> Double in
      return self.distanceAccumulator.totalMeters
    }

    // Reset the native total + per-fix anchor to zero (new run start).
    Function("resetDistanceAccumulator") {
      self.runOnMain {
        self.distanceAccumulator.reset()
      }
    }

    // Stop native distance accumulation. The shared location driver is torn down only when NEITHER
    // the periodic re-POST nor the distance accumulator needs it (see stopDistanceAccumulator).
    Function("stopDistanceAccumulator") {
      self.runOnMain {
        self.stopDistanceAccumulation()
      }
    }
  }

  // MARK: - Periodic lifecycle

  private func startPeriodic(url: String, authToken: String, jsonBody: String, intervalMs: Int) {
    let intervalSeconds = (intervalMs > 0 ? Double(intervalMs) : Double(MatchProgressUploaderModule.defaultIntervalMs)) / 1000.0
    periodicWantsLocation = true
    let driver = ensureLocationDriver(intervalSeconds: intervalSeconds)
    // Refresh the cached payload on every start (mirrors Kotlin's "scheduledTask != null → just
    // update payload" early return — here the shared driver may already be running for the distance
    // accumulator, so always refresh + (re-)start.)
    driver.updatePayload(url: url, authToken: authToken, jsonBody: jsonBody)
    // AUTHORIZATION/CRASH-SAFETY is enforced inside start(): the driver only flips
    // allowsBackgroundLocationUpdates when status is .authorizedAlways, and no-ops the location
    // session entirely for non-authorized states so it can never crash. start() is idempotent.
    driver.start()
  }

  private func stopPeriodic() {
    // BATTERY/LIFECYCLE: clear the cached payload so no re-POST fires, then tear down the shared
    // location session ONLY if the distance accumulator no longer needs it either.
    periodicWantsLocation = false
    locationDriver?.clearPayload()
    teardownLocationDriverIfIdle()
  }

  // TERMINAL SELF-STOP (Stage 5) — the driver observed a terminal server response (2xx/404/410)
  // for a payload JS marked TERMINAL (the finished body). Perform the SAME teardown the JS ACK
  // path eventually requests (stopPeriodicUpload + stopDistanceAccumulator): drop BOTH want-flags,
  // clear the cached payload, release the shared CLLocationManager — the match is over for this
  // runner, so nothing needs GPS anymore. Runs on the MAIN thread (the driver invokes it from its
  // main-queue completion), so it is serialized with — and idempotent against — the JS-initiated
  // stops that arrive later when the app wakes (they find the flags already false / the driver nil
  // and no-op; double-stop can never crash or double-release). The distance accumulator's TOTAL is
  // preserved (reset only happens on a new run start), matching the JS stop semantics.
  private func stopAfterTerminalFinishAck() {
    periodicWantsLocation = false
    distanceWantsLocation = false
    locationDriver?.clearPayload()
    teardownLocationDriverIfIdle()
  }

  // MARK: - Distance accumulator lifecycle

  private func startDistanceAccumulator(options: [String: Any]) {
    distanceAccumulator.configure(options: options)
    // start resets the per-fix anchor so the first fix only sets the origin (no initial jump); the
    // running total is preserved so a same-run re-start (e.g. a second background flush) does not
    // lose accrued distance — the JS merge seeds the baseline separately.
    distanceAccumulator.beginSession()
    distanceWantsLocation = true
    // Reuse the SAME shared driver as the periodic re-POST (no new CLLocationManager). If the
    // periodic path has not started it, this brings it up at the periodic default cadence; the
    // distance accumulator does not care about the throttle interval (it consumes every fix).
    let driver = ensureLocationDriver(intervalSeconds: Double(MatchProgressUploaderModule.defaultIntervalMs) / 1000.0)
    driver.start()
  }

  private func stopDistanceAccumulation() {
    // Stop feeding distance, then tear down the shared session ONLY if the periodic re-POST no
    // longer needs it either — so distance stop never starves an in-flight match re-POST.
    distanceWantsLocation = false
    teardownLocationDriverIfIdle()
  }

  // MARK: - Shared location driver lifecycle

  // Create the shared driver on first need; reuse it otherwise. The driver feeds BOTH the periodic
  // re-POST throttle AND the distance accumulator from one didUpdateLocations stream.
  private func ensureLocationDriver(intervalSeconds: Double) -> PeriodicLocationDriver {
    if let driver = locationDriver {
      return driver
    }

    let driver = PeriodicLocationDriver(
      intervalSeconds: intervalSeconds,
      send: { [weak self] sendUrl, sendToken, sendBody, completion in
        self?.send(url: sendUrl, authToken: sendToken, jsonBody: sendBody, completion: completion)
      },
      emit: { [weak self] body in
        // On a 2xx, emit the body so JS applies the opponent board WITHOUT a JS timer.
        self?.sendEvent("onMatchProgressResponse", ["body": body])
      },
      pushLiveActivity: { [weak self] responseBody, requestBody in
        // On a 2xx, ALSO drive the iOS Live Activity card's match board (PACE + 간격/gap + both-runner
        // board) natively, so it stays fresh while the screen is off / JS is suspended. iOS-only,
        // fire-and-forget, and completely independent of the bg-sync promise / periodicInFlight /
        // lastPostAt (it only reads the response + the cached request + the native accumulator total
        // and posts a NotificationCenter notification the LiveActivity pod observes).
        self?.pushLiveActivityUpdate(responseBody: responseBody, requestBody: requestBody)
      },
      onLocation: { [weak self] location in
        // Feed every delivered fix into the distance accumulator. It self-gates on the want-flag so
        // a driver kept alive purely for the periodic re-POST does not accrue distance.
        guard let self = self, self.distanceWantsLocation else {
          return
        }
        if let advancedMeters = self.distanceAccumulator.consume(location: location) {
          self.sendEvent("onDistanceAccumulated", ["meters": advancedMeters])
        }
      },
      onTerminalAck: { [weak self] in
        // TERMINAL SELF-STOP (Stage 5): a JS-marked TERMINAL payload got a terminal server response
        // (2xx/404/410). JS may be suspended and unable to observe the ACK, so the module stops the
        // cadence + shared CLLocationManager + distance accumulator natively. Invoked on main.
        self?.stopAfterTerminalFinishAck()
      }
    )
    locationDriver = driver
    return driver
  }

  // Tear the shared driver down ONLY when neither consumer needs it, so stopping one path never
  // kills the other's GPS. Fully releases the CLLocationManager so nothing drains battery once the
  // match ends.
  private func teardownLocationDriverIfIdle() {
    if periodicWantsLocation || distanceWantsLocation {
      return
    }
    locationDriver?.stop()
    locationDriver = nil
  }

  // Core Location must be created/started/stopped on a thread with a live run loop; the main thread
  // always has one. Expo Function bodies may run off-main, so hop on when touching the driver.
  private func runOnMain(_ work: @escaping () -> Void) {
    if Thread.isMainThread {
      work()
    } else {
      DispatchQueue.main.async(execute: work)
    }
  }

  deinit {
    // OnDestroy-equivalent: guarantee the location session can never leak past module teardown.
    // Clear both want-flags so neither consumer keeps the driver alive after teardown.
    periodicWantsLocation = false
    distanceWantsLocation = false
    let driver = locationDriver
    locationDriver = nil
    if let driver = driver {
      if Thread.isMainThread {
        driver.stop()
      } else {
        DispatchQueue.main.async {
          driver.stop()
        }
      }
    }
  }

  // MARK: - Run-save delivery (hands-free finish)

  // 세대 카운터 — cancel 또는 새 arm이 값을 올리면 진행 중이던 재시도 체인이 다음
  // 체크포인트에서 조용히 끝난다. 데이터 레이스 방지를 위해 모든 읽기/쓰기를
  // runSaveQueue(직렬)에서만 수행한다 (URLSession 콜백도 이 큐로 되돌아온다).
  private var runSaveGeneration: Int = 0
  // 메인 스레드 전용 (UIApplication API 짝).
  private var runSaveBackgroundTaskId: UIBackgroundTaskIdentifier = .invalid
  private let runSaveQueue = DispatchQueue(label: "rg.run-save-uploader")
  private static let runSaveRetryDelaysSeconds: [Double] = [0, 5, 15, 30, 60]

  private func armRunSave(url: String, authToken: String, jsonBody: String) {
    // 백그라운드 실행 시간 확보 (적대 리뷰 2026-08-07): 크로싱 직후 Stage-5 터미널
    // self-stop이 CLLocationManager를 내리면 iOS가 수 초 안에 앱을 suspend한다. GCD
    // asyncAfter는 suspend된 프로세스에서 아예 흐르지 않으므로 재시도 사다리가 얼어붙는다.
    // beginBackgroundTask로 실행 창을 확보해 초반 시도들이 실제로 실행되게 한다.
    beginRunSaveBackgroundTask()

    runSaveQueue.async { [weak self] in
      guard let self else { return }
      self.runSaveGeneration += 1
      let myGeneration = self.runSaveGeneration
      self.attemptRunSave(
        url: url,
        authToken: authToken,
        jsonBody: jsonBody,
        attemptIndex: 0,
        generation: myGeneration
      )
    }
  }

  // UIApplication 백그라운드 태스크 짝 — 식별자는 메인 스레드에서만 만지므로
  // runSaveQueue와 경합하지 않는다 (UIApplication API 규약).
  private func beginRunSaveBackgroundTask() {
    runOnMain { [weak self] in
      guard let self else { return }
      if self.runSaveBackgroundTaskId != .invalid {
        UIApplication.shared.endBackgroundTask(self.runSaveBackgroundTaskId)
        self.runSaveBackgroundTaskId = .invalid
      }
      self.runSaveBackgroundTaskId = UIApplication.shared.beginBackgroundTask(withName: "rg.run-save") { [weak self] in
        // 만료 통보 — 즉시 반납하지 않으면 OS가 앱을 종료시킨다.
        self?.endRunSaveBackgroundTask()
      }
    }
  }

  // 백그라운드 태스크 반납 — 사다리가 끝났거나(성공/결정적 거절/소진/취소) 만료될 때.
  private func endRunSaveBackgroundTask() {
    runOnMain { [weak self] in
      guard let self, self.runSaveBackgroundTaskId != .invalid else { return }
      UIApplication.shared.endBackgroundTask(self.runSaveBackgroundTaskId)
      self.runSaveBackgroundTaskId = .invalid
    }
  }

  // 항상 runSaveQueue 위에서 호출된다.
  private func attemptRunSave(
    url: String,
    authToken: String,
    jsonBody: String,
    attemptIndex: Int,
    generation: Int
  ) {
    guard attemptIndex < MatchProgressUploaderModule.runSaveRetryDelaysSeconds.count else {
      endRunSaveBackgroundTask()
      return // 재시도 소진 — 앱을 열면 JS 저장 흐름이 이어받는다.
    }

    let delaySeconds = MatchProgressUploaderModule.runSaveRetryDelaysSeconds[attemptIndex]
    runSaveQueue.asyncAfter(deadline: .now() + delaySeconds) { [weak self] in
      guard let self else { return }
      guard self.runSaveGeneration == generation else {
        self.endRunSaveBackgroundTask()
        return // 취소/대체됨
      }

      self.send(url: url, authToken: authToken, jsonBody: jsonBody, useRunSaveSession: true) { _, statusCode in
        // URLSession 콜백 스레드에서 세대를 만지지 않도록 직렬 큐로 복귀.
        self.runSaveQueue.async {
          guard self.runSaveGeneration == generation else {
            self.endRunSaveBackgroundTask()
            return
          }
          // Kotlin과 같은 3분기 (적대 리뷰 2026-08-07): 2xx 완료 / 4xx 결정적 거절 /
          // 그 외(3xx·5xx·전송실패)는 재시도. 이전엔 3xx를 거절로 묶어 iOS만 조기 포기했다.
          if let statusCode, (200...299).contains(statusCode) || (400...499).contains(statusCode) {
            self.endRunSaveBackgroundTask()
            return
          }
          self.attemptRunSave(
            url: url,
            authToken: authToken,
            jsonBody: jsonBody,
            attemptIndex: attemptIndex + 1,
            generation: generation
          )
        }
      }
    }
  }

  // MARK: - Shared HTTP send

  // Shared HTTP send. Resolves the 2xx body string (or nil on non-2xx / any error) PLUS the raw
  // HTTP status code when an HTTP response actually arrived (nil on transport error/timeout), so
  // the periodic driver can recognize a TERMINAL response (2xx/404/410) at the point the status is
  // already inspected — no second URLSession, no change to the request path. Used by both the
  // one-shot upload() (which ignores the status) and the location-driven periodic re-POST.
  private func send(
    url urlString: String,
    authToken: String,
    jsonBody: String,
    useRunSaveSession: Bool = false,
    completion: @escaping (String?, Int?) -> Void
  ) {
    guard let url = URL(string: urlString) else {
      // Mirror Kotlin: any failure resolves nil so the next tick retries (never rejects/crashes).
      completion(nil, nil)
      return
    }

    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.timeoutInterval = MatchProgressUploaderModule.timeoutSeconds
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue("Bearer \(authToken)", forHTTPHeaderField: "Authorization")
    request.httpBody = jsonBody.data(using: .utf8)

    let activeSession = useRunSaveSession ? runSaveSession : session
    let task = activeSession.dataTask(with: request) { data, response, error in
      // Mirror Kotlin's catch → null on any transport error. No HTTP response arrived, so there is
      // no status code either — a transport error can never read as a terminal ACK.
      if error != nil {
        completion(nil, nil)
        return
      }

      guard let httpResponse = response as? HTTPURLResponse else {
        completion(nil, nil)
        return
      }

      let statusCode = httpResponse.statusCode
      // Mirror Kotlin: only hand back a body the JS side can apply; non-2xx bodies are diagnostics,
      // not state, so resolve nil for them. The status code is still surfaced so the driver can
      // recognize a definitive 404/410 as a terminal ACK for a terminal-marked payload.
      guard (200...299).contains(statusCode) else {
        completion(nil, statusCode)
        return
      }

      let body = data.flatMap { String(data: $0, encoding: .utf8) }
      completion(body, statusCode)
    }

    task.resume()
  }

  // MARK: - iOS Live Activity native match-board push (screen-off)

  // ONE board runner — the native mirror of LiveCardBoardRunner (buildLiveCardState.ts): a single
  // current distance (km) per runner + isMe.
  private struct BoardRunner {
    let name: String
    let distanceKm: Double
    let isMe: Bool
  }

  // Display name used for the current user's own rank-bar row. The native side has no access to the
  // JS `context.myName` (it is not in the request body nor the response), so the screen-off push uses
  // this fallback. The foreground(JS) push uses the real display name; the row is matched by isMe so
  // rank/gap/progress are identical — only the my-row LABEL can differ until the user unlocks. KNOWN
  // GAP (see handoff): if the rank bar shows my real name in the foreground it will read "나" while
  // screen-off. All numeric fields are identical.
  private static let myDisplayNameFallback = "나"

  // Build + post the native Live Activity match-board update. MIRRORS the JS pure helpers EXACTLY
  // (buildLiveCardState.ts + liveActivityController.ts buildBoardFromMatchStatus/buildGroupBoard) so
  // the screen-off(native) push produces an IDENTICAL ContentState to the foreground(JS) push.
  //
  // Parse RESPONSE (RunningMatchStatusResponse): mode, distanceKm(goal), duel opponent{name,
  // liveDistanceKm, officialDistanceKm, officialReady}, group participants[]{name, seedRank,
  // liveDistanceKm, officialDistanceKm, officialReady} + mySeedRank.
  // Parse REQUEST (UpdateRunningMatchProgressInput): elapsedSeconds, matchId.
  // my distanceKm = native distanceAccumulator total (meters)/1000.
  //
  // Fire-and-forget: posts a NotificationCenter notification the LiveActivity pod observes. NEVER
  // touches periodicInFlight / lastPostAt / the bg-sync promise. iOS Live Activity is only applied
  // inside the LiveActivity pod behind #available(iOS 16.2,*), so this is a harmless no-op pre-16.2.
  private func pushLiveActivityUpdate(responseBody: Data?, requestBody: Data?) {
    guard
      let responseBody = responseBody,
      let response = (try? JSONSerialization.jsonObject(with: responseBody)) as? [String: Any]
    else {
      return
    }

    // mode: only duel/group reach here (the uploader runs for matches). Solo is never a match board;
    // if a "solo" sneaks in, bail so we never build a board for it.
    let mode = (response["mode"] as? String) ?? ""
    guard mode == "duel" || mode == "group" else {
      return
    }

    // goal distance (km) — drives progress0to1 (response.distanceKm).
    let goalDistanceKm = doubleFromJSON(response["distanceKm"]) ?? 0

    // elapsedSeconds + matchId come from the REQUEST body we just POSTed (simpler than recomputing
    // from slotStartAt). elapsedSeconds clamped to a non-negative whole second (mirrors
    // buildLiveCardState's `Math.max(0, Math.round(...))`).
    var requestElapsedSeconds = 0
    if
      let requestBody = requestBody,
      let request = (try? JSONSerialization.jsonObject(with: requestBody)) as? [String: Any],
      let elapsed = doubleFromJSON(request["elapsedSeconds"])
    {
      requestElapsedSeconds = Int(max(0, (elapsed).rounded()))
    }
    let elapsedSeconds = max(0, requestElapsedSeconds)

    // my distance (km) from the native accumulator (the same source getAccumulatedDistanceMeters
    // exposes), so distance keeps moving screen-off.
    let myDistanceKm = distanceAccumulator.totalMeters / 1000.0

    // Build the board EXACTLY like buildBoardFromMatchStatus/buildGroupBoard.
    let board = buildBoardFromResponse(response: response, mode: mode, myDistanceKm: myDistanceKm)

    // paceText — mirror buildAveragePace(myDistanceKm, elapsedSeconds) precisely.
    let paceText = buildAveragePaceMirror(distanceKm: myDistanceKm, elapsedSeconds: elapsedSeconds)

    // distanceM — mirror toWholeMeters(myDistanceKm).
    let distanceM = toWholeMetersMirror(myDistanceKm)

    let nowMs = Date().timeIntervalSince1970 * 1000.0
    let staleDateMs = nowMs + 10_000.0 // LIVE_CARD_STALE_AFTER_MS
    let timerStartMs = nowMs - Double(elapsedSeconds) * 1000.0

    // Sort DESC (stable) → rank/gap/rank-bar, mirroring buildLiveCardState.
    let sortedDesc = sortBoardByDistanceDescMirror(board)
    let myIndex = sortedDesc.firstIndex(where: { $0.isMe })

    let totalRunners = sortedDesc.count
    let myRank: Int? = myIndex.map { $0 + 1 }
    let adjacentGapText = buildAdjacentGapTextMirror(sortedDesc)
    let rankBar = buildRankBarRunnersMirror(sortedDesc, goalDistanceKm: goalDistanceKm)

    // Hand FINAL primitives to the LiveActivity pod (it does NO recomputation). Empty adjacentGapText
    // string → the pod maps it to nil (matches the JS optional being omitted).
    var userInfo: [String: Any] = [
      "elapsedSeconds": elapsedSeconds,
      "distanceM": distanceM,
      "paceText": paceText,
      "staleDateMs": staleDateMs,
      "isRunning": true,
      "timerStartMs": timerStartMs,
      "totalRunners": totalRunners,
      "goalDistanceKm": goalDistanceKm,
      "mode": mode,
      "runnerNames": rankBar.map { $0.name },
      "runnerProgress": rankBar.map { $0.progress0to1 },
      "runnerIsMe": rankBar.map { $0.isMe },
      "adjacentGapText": adjacentGapText ?? "",
    ]
    if let myRank = myRank {
      userInfo["myRank"] = myRank
    }

    NotificationCenter.default.post(
      name: Notification.Name("RGMatchProgressNativeUpdate"),
      object: nil,
      userInfo: userInfo
    )
  }

  // Mirror of buildBoardFromMatchStatus + buildGroupBoard (liveActivityController.ts). Per-runner
  // distance = officialReady && officialDistanceKm != nil ? officialDistanceKm : (liveDistanceKm ?? 0).
  private func buildBoardFromResponse(
    response: [String: Any],
    mode: String,
    myDistanceKm: Double
  ) -> [BoardRunner] {
    if mode == "group" {
      guard let participants = response["participants"] as? [[String: Any]], !participants.isEmpty else {
        return []
      }
      // meSeedRank = mySeedRank ?? 1.
      let meSeedRank = intFromJSON(response["mySeedRank"]) ?? 1
      return participants.map { participant in
        let name = (participant["name"] as? String) ?? ""
        let distanceKm = liveOrOfficialKm(participant)
        let seedRank = intFromJSON(participant["seedRank"]) ?? -1
        return BoardRunner(name: name, distanceKm: distanceKm, isMe: seedRank == meSeedRank)
      }
    }

    // duel
    guard let opponent = response["opponent"] as? [String: Any] else {
      return []
    }
    let opponentName = (opponent["name"] as? String) ?? ""
    let opponentDistanceKm = liveOrOfficialKm(opponent)
    return [
      BoardRunner(name: MatchProgressUploaderModule.myDisplayNameFallback, distanceKm: myDistanceKm, isMe: true),
      BoardRunner(name: opponentName, distanceKm: opponentDistanceKm, isMe: false),
    ]
  }

  // officialReady && officialDistanceKm != nil ? officialDistanceKm : (liveDistanceKm ?? 0).
  private func liveOrOfficialKm(_ runner: [String: Any]) -> Double {
    let officialReady = (runner["officialReady"] as? Bool) ?? false
    if officialReady, let official = doubleFromJSON(runner["officialDistanceKm"]) {
      return official
    }
    return doubleFromJSON(runner["liveDistanceKm"]) ?? 0
  }

  // Mirror toWholeMeters: round(distanceKm*1000) when distanceKm finite & > 0, else 0.
  private func toWholeMetersMirror(_ distanceKm: Double) -> Int {
    guard distanceKm.isFinite, distanceKm > 0 else {
      return 0
    }
    return Int((distanceKm * 1000.0).rounded())
  }

  // Mirror toProgress0to1: 0 when no positive goal OR distance<=0; else clamp(distanceKm/goal, 0...1).
  private func toProgress0to1Mirror(_ distanceKm: Double, goalDistanceKm: Double) -> Double {
    guard goalDistanceKm.isFinite, goalDistanceKm > 0 else {
      return 0
    }
    guard distanceKm.isFinite, distanceKm > 0 else {
      return 0
    }
    return max(0.0, min(1.0, distanceKm / goalDistanceKm))
  }

  // Mirror buildAveragePace → buildAveragePaceForFinishedRun → formatPaceFromSecondsPerKm.
  //   - distance < MIN_LIVE_AVERAGE_PACE_DISTANCE_KM(0.1) OR not finite → "--:--/km"
  //   - elapsedSeconds <= 0 → "--:--/km"
  //   - else secondsPerKm = elapsedSeconds/distanceKm; rounded = round(secondsPerKm);
  //     "MM:SS/km" zero-padded (minutes = rounded/60, seconds = rounded%60).
  private func buildAveragePaceMirror(distanceKm: Double, elapsedSeconds: Int) -> String {
    let minLiveDistanceKm = 0.1 // MIN_LIVE_AVERAGE_PACE_DISTANCE_KM
    guard distanceKm.isFinite, distanceKm >= minLiveDistanceKm, elapsedSeconds > 0 else {
      return "--:--/km"
    }
    let secondsPerKm = Double(elapsedSeconds) / distanceKm
    guard secondsPerKm.isFinite, secondsPerKm > 0 else {
      return "--:--/km"
    }
    let rounded = Int(secondsPerKm.rounded())
    let minutes = rounded / 60
    let seconds = rounded % 60
    return String(format: "%02d:%02d/km", minutes, seconds)
  }

  // Stable sort by distance DESC; ties keep the original (caller) order — mirrors
  // sortBoardByDistanceDesc (which carries the original index as the tie-break).
  private func sortBoardByDistanceDescMirror(_ board: [BoardRunner]) -> [BoardRunner] {
    return board.enumerated()
      .sorted { lhs, rhs in
        if lhs.element.distanceKm != rhs.element.distanceKm {
          return lhs.element.distanceKm > rhs.element.distanceKm
        }
        return lhs.offset < rhs.offset
      }
      .map { $0.element }
  }

  // Mirror buildAdjacentGapText: nil when no me / fewer than 2 runners; "-Xm" trailing the runner just
  // ahead; "+Xm" leading the runner just behind when I lead. Meters = round(max(0, Δkm)*1000).
  private func buildAdjacentGapTextMirror(_ sortedDesc: [BoardRunner]) -> String? {
    guard let myIndex = sortedDesc.firstIndex(where: { $0.isMe }), sortedDesc.count >= 2 else {
      return nil
    }
    let me = sortedDesc[myIndex]
    if myIndex > 0 {
      let ahead = sortedDesc[myIndex - 1]
      let gapMeters = Int((max(0.0, ahead.distanceKm - me.distanceKm) * 1000.0).rounded())
      return "-\(gapMeters)m"
    }
    let behind = sortedDesc[myIndex + 1]
    let gapMeters = Int((max(0.0, me.distanceKm - behind.distanceKm) * 1000.0).rounded())
    return "+\(gapMeters)m"
  }

  // One rank-bar row (the native mirror of LiveActivityRunner), carried as primitives in userInfo.
  private struct RankBarRunner {
    let name: String
    let progress0to1: Double
    let isMe: Bool
  }

  // Mirror buildRankBarRunners: top-3 leader-first, plus me appended when not already in the top-3.
  private func buildRankBarRunnersMirror(
    _ sortedDesc: [BoardRunner],
    goalDistanceKm: Double
  ) -> [RankBarRunner] {
    let rankBarTopCount = 3 // RANK_BAR_TOP_COUNT
    let topRows = Array(sortedDesc.prefix(rankBarTopCount))
    let myIndex = sortedDesc.firstIndex(where: { $0.isMe })
    let meInTop = (myIndex != nil) && (myIndex! < rankBarTopCount)

    let rows: [BoardRunner]
    if meInTop || myIndex == nil {
      rows = topRows
    } else {
      rows = topRows + [sortedDesc[myIndex!]]
    }

    return rows.map { runner in
      RankBarRunner(
        name: runner.name,
        progress0to1: toProgress0to1Mirror(runner.distanceKm, goalDistanceKm: goalDistanceKm),
        isMe: runner.isMe
      )
    }
  }

  // JSON number coercion: JSONSerialization yields NSNumber for both ints and doubles.
  private func doubleFromJSON(_ value: Any?) -> Double? {
    if let number = value as? NSNumber {
      return number.doubleValue
    }
    if let doubleValue = value as? Double {
      return doubleValue
    }
    if let intValue = value as? Int {
      return Double(intValue)
    }
    return nil
  }

  private func intFromJSON(_ value: Any?) -> Int? {
    if let number = value as? NSNumber {
      return number.intValue
    }
    if let intValue = value as? Int {
      return intValue
    }
    if let doubleValue = value as? Double {
      return Int(doubleValue)
    }
    return nil
  }
}

// MARK: - PeriodicLocationDriver

// Owns a CLLocationManager whose location deliveries drive the periodic re-POST. All mutable state
// is touched only on the main thread (where Core Location callbacks are delivered, since the manager
// is created on the main thread), so plain stored properties are safe without extra locking.
private final class PeriodicLocationDriver: NSObject, CLLocationManagerDelegate {
  private let intervalSeconds: Double
  // The shared module HTTP send + the Expo emit, injected so the driver reuses the EXISTING send()
  // helper and never recomputes the payload. send's completion carries (2xx body or nil, HTTP
  // status code or nil on transport error) — the status is what the terminal self-stop reads.
  private let send: (String, String, String, @escaping (String?, Int?) -> Void) -> Void
  private let emit: (String) -> Void
  // iOS Live Activity native push hook. Invoked on the main thread right AFTER emit, with the 2xx
  // RESPONSE body + the request body that produced it (both as Data?). Fire-and-forget; the module
  // turns these into a Live Activity match-board update (iOS 16.2+ only) so the lock-screen card
  // stays fresh while JS is suspended. Never touches periodicInFlight / lastPostAt / the bg promise.
  private let pushLiveActivity: (Data?, Data?) -> Void
  // Per-fix hook so the module can feed the distance accumulator from this SAME location stream
  // (no second CLLocationManager). Invoked on the main thread for every delivered location.
  private let onLocation: (CLLocation) -> Void
  // TERMINAL SELF-STOP hook (Stage 5). Invoked on the main thread when a re-POST of a JS-marked
  // TERMINAL payload received a terminal server response (2xx/404/410). The module performs the
  // full stop (cadence + shared manager + distance accumulator) — the driver never tears itself
  // down directly because the module owns the want-flag refcount.
  private let onTerminalAck: () -> Void

  private var manager: CLLocationManager?

  // Latest JS-built payload (the native side only re-sends this — never recomputes it).
  private var url: String?
  private var token: String?
  private var body: String?

  // TERMINAL mark (Stage 5) — true when JS marked the CURRENT cached payload TERMINAL (a finished
  // body). RESET by updatePayload/clearPayload/stop: an unmarked fresher payload is by definition
  // non-terminal, so a superseding match's running payload can never inherit the mark (its live
  // cadence must survive a late ACK for the previous finished match). Old JS bundles never set it,
  // so the self-stop below never fires for them — byte-identical behavior to the previous binary.
  private var payloadIsTerminal = false

  // Single-flight: a delivery never overlaps an in-flight POST (mirrors the Android AtomicBoolean
  // / the JS inFlightBackgroundMatchProgressSync lock).
  private var periodicInFlight = false

  // Throttle: rate-limit re-POSTs to ~intervalSeconds using CFAbsoluteTimeGetCurrent (Foundation /
  // CoreFoundation only — NO QuartzCore/CACurrentMediaTime). 0 means "no POST yet".
  private var lastPostAt: CFAbsoluteTime = 0

  init(
    intervalSeconds: Double,
    send: @escaping (String, String, String, @escaping (String?, Int?) -> Void) -> Void,
    emit: @escaping (String) -> Void,
    pushLiveActivity: @escaping (Data?, Data?) -> Void,
    onLocation: @escaping (CLLocation) -> Void,
    onTerminalAck: @escaping () -> Void
  ) {
    self.intervalSeconds = intervalSeconds
    self.send = send
    self.emit = emit
    self.pushLiveActivity = pushLiveActivity
    self.onLocation = onLocation
    self.onTerminalAck = onTerminalAck
    super.init()
  }

  func updatePayload(url: String, authToken: String, jsonBody: String) {
    self.url = url
    self.token = authToken
    self.body = jsonBody
    // A payload update is non-terminal until JS explicitly re-marks it (the mark call follows the
    // handoff through the same main queue, so the ordering is deterministic).
    self.payloadIsTerminal = false
  }

  // TERMINAL mark (Stage 5): flag the current cached payload as a finished body whose terminal
  // server response (2xx/404/410) must self-stop the cadence. Main-thread only, like all state here.
  func markPayloadTerminal() {
    payloadIsTerminal = true
  }

  // Clear ONLY the cached re-POST payload (used when the periodic re-POST stops but the distance
  // accumulator still needs the shared location stream). maybePost() then early-returns on the nil
  // payload, so no POST fires, while didUpdateLocations keeps feeding the accumulator.
  func clearPayload() {
    self.url = nil
    self.token = nil
    self.body = nil
    self.payloadIsTerminal = false
    self.periodicInFlight = false
    self.lastPostAt = 0
  }

  func start() {
    // Reuse an existing session if already started.
    if manager != nil {
      return
    }

    let manager = CLLocationManager()
    manager.delegate = self
    manager.desiredAccuracy = kCLLocationAccuracyBestForNavigation
    manager.distanceFilter = kCLDistanceFilterNone
    manager.pausesLocationUpdatesAutomatically = false
    manager.activityType = .fitness

    // AUTHORIZATION / CRASH-SAFETY: read the status WITHOUT prompting (the running app already
    // requests Always for background tracking). Only enable background updates for .authorizedAlways.
    let status = manager.authorizationStatus
    switch status {
    case .authorizedAlways:
      // Safe to run a background location session: Always + UIBackgroundModes:location entitlement.
      manager.allowsBackgroundLocationUpdates = true
      manager.showsBackgroundLocationIndicator = true
      self.manager = manager
      manager.startUpdatingLocation()
    case .authorizedWhenInUse:
      // Start updates so we still re-POST while the app is in use, but NEVER flip the background
      // flag without Always (doing so crashes). Foreground-only re-POSTs; no bg-mode risk.
      self.manager = manager
      manager.startUpdatingLocation()
    default:
      // notDetermined / denied / restricted: no-op the periodic path so it can NEVER crash. The
      // existing JS-driven path remains the only uploader. Release the unused manager.
      manager.delegate = nil
      self.manager = nil
    }
  }

  func stop() {
    // BATTERY/LIFECYCLE: fully stop + release the location session and clear cached state.
    if let manager = manager {
      manager.stopUpdatingLocation()
      manager.delegate = nil
    }
    manager = nil
    url = nil
    token = nil
    body = nil
    payloadIsTerminal = false
    periodicInFlight = false
    lastPostAt = 0
  }

  // MARK: CLLocationManagerDelegate

  func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
    // Feed every delivered fix into the distance accumulator FIRST (in chronological order), then
    // run the throttled re-POST. The accumulator self-gates inside the module, so this is a cheap
    // no-op when distance accumulation is not active.
    for location in locations {
      onLocation(location)
    }
    maybePost()
  }

  func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
    // Best-effort: a transient location error must never crash the run; the next delivery retries.
  }

  // MARK: Re-POST

  private func maybePost() {
    guard let url = url, let token = token, let body = body else {
      return
    }

    // Throttle to ~intervalSeconds so a burst of fixes does not spam the server.
    let now = CFAbsoluteTimeGetCurrent()
    if lastPostAt != 0 && (now - lastPostAt) < intervalSeconds {
      return
    }

    // Single-flight: drop this delivery if a POST is still running (the next delivery re-sends the
    // freshest payload anyway).
    if periodicInFlight {
      return
    }
    periodicInFlight = true
    lastPostAt = now

    // Snapshot the request body NOW (before the async send): the cached `body` may be overwritten by
    // a fresher updatePayload before this POST's completion fires, but the Live Activity push must
    // pair the RESPONSE with the REQUEST that produced it (elapsedSeconds/matchId come from this exact
    // request body). UTF-8 → Data for the module's pushLiveActivity(responseBody:requestBody:).
    let requestBodyData = body.data(using: .utf8)
    // TERMINAL SELF-STOP (Stage 5) — snapshot the terminal mark WITH the request: the response must
    // be judged against the payload that produced it, not whatever is cached when it lands.
    let requestWasTerminal = payloadIsTerminal

    send(url, token, body) { [weak self] responseBody, statusCode in
      guard let self = self else {
        return
      }
      // Re-enter on the main thread to clear the flag + emit, keeping all driver state single-thread.
      DispatchQueue.main.async {
        self.periodicInFlight = false
        // send() returns nil on non-2xx / failure, so the emit fires only when there is state to
        // apply — mirrors the Android `if (responseBody != null) sendEvent(...)`. UNCHANGED by the
        // terminal self-stop below: every 2xx body still reaches JS exactly as before, so the JS
        // ACK bookkeeping (settle pending finish, clearPendingFinish, ...) keeps working on wake.
        if let responseBody = responseBody {
          self.emit(responseBody)
          // iOS-only: ALSO drive the Live Activity match board natively, right AFTER emit. Pairs the
          // 2xx response with the snapshotted request body. Fire-and-forget; independent of
          // periodicInFlight / lastPostAt / the bg-sync promise.
          self.pushLiveActivity(responseBody.data(using: .utf8), requestBodyData)
        }
        // TERMINAL SELF-STOP (Stage 5) — fires ONLY when (a) the POSTed payload was terminal-marked
        // (a normal running-status 2xx can never get here), (b) the mark is STILL set (a superseding
        // non-terminal payload cleared it — its live cadence must survive a late ACK for the
        // finished match), and (c) the server response is terminal: 2xx (the server froze my finish
        // first-write-wins) or a definitive 404/410 — the EXACT status set the JS pending-finish
        // path treats as terminal (isDefinitiveMatchGoneError in backgroundMatchProgressSync.ts).
        // Transport errors/timeouts carry no statusCode, so the cadence keeps retrying on them.
        if
          requestWasTerminal,
          self.payloadIsTerminal,
          let statusCode = statusCode,
          (200...299).contains(statusCode) || statusCode == 404 || statusCode == 410
        {
          self.onTerminalAck()
        }
      }
    }
  }
}

// MARK: - DistanceAccumulator

// Native running-total distance, advanced from the SAME location stream as the periodic re-POST so
// a run's distance keeps moving while the JS thread is suspended (screen off). Mirrors the JS
// per-fix filter chain (src/features/runs/tracking/background/locationDistance.ts +
// routeAccumulator.ts appendTrackedLocation) in the SAME order: accuracy + age windows, cold-start
// warmup discard, min time delta, both teleport gates, the stationary/poor-accuracy noise
// rejection, and the accuracy-scaled distance gate. Only the JS route-REWRITE passes (cold-start
// excursion collapse + mid-run lateral-jitter collapse) stay JS-only — they rewrite the whole route
// and recompute the total from it, which needs the full route history the native side does not
// keep. The JS merge is FRESH-JS-WINS, so this total only ever fills screen-off gaps.
//
// Wire-format compatibility: the six original constants keep their existing keys. Every LATER-ADDED
// constant is OPTIONAL — an absent key leaves its gate DISABLED, so an OLD JS bundle (which never
// sends the new keys) drives this binary exactly like the previous one, and a NEW JS bundle against
// an OLD binary is safe because old binaries ignore unknown keys.
//
// Threading: configure/seed/reset/beginSession/consume are all invoked on the MAIN thread (Core
// Location callbacks + the runOnMain-marshalled Expo Functions). The synchronous totalMeters read
// can come from any thread (Expo Function bodies may run off-main), so the total is guarded by an
// NSLock (Foundation — already imported) — a single Double load/store, no GPS work under the lock.
private final class DistanceAccumulator {
  // JS COLD_START_MAX_BUFFER_FIXES / MIN_RELIABLE_RUNNING_SPEED_MPS — formula internals the JS side
  // also hardcodes (they are not part of the options wire format).
  private static let coldStartMaxBufferFixes = 8
  private static let minReliableSpeedMps: Double = 0.7

  // Original filter constants (always in the wire format). Defaults mirror the CURRENT JS source
  // values so a missing/garbled option can never widen the gate open.
  private var maxAccuracyMeters: Double = 40
  private var distanceGateBaseMeters: Double = 3.0
  private var distanceGateAccuracyScale: Double = 0.15
  private var teleportMinMeters: Double = 35
  private var maxSpeedMps: Double = 8.5
  private var maxLocationAgeMs: Double = 15000

  // Later-added filter constants (the 99693a0 wire-format extension). nil = not delivered = that
  // gate stays disabled (the previous binary's behavior, for old JS bundles).
  private var minTimeDeltaMs: Double?
  private var teleportAccuracyScale: Double?
  private var teleportMaxSpeedMps: Double?
  private var stationarySpeedMps: Double?
  private var poorAccuracyMeters: Double?
  private var coldStartStableFixCount: Int?
  private var coldStartMaxClusterRadiusMeters: Double?
  private var coldStartMaxAccuracyMeters: Double?
  private var coldStartMaxWindowMs: Double?

  // Reserved overrides (no JS bundle sends them yet). minMovementMeters is the noisy-gate floor
  // (JS MIN_MOVEMENT_DISTANCE_METERS); a nil maxFutureLocationMs keeps today's symmetric age window.
  private var minMovementMeters: Double = 3.0
  private var maxFutureLocationMs: Double?

  // Per-fix anchors, mirroring JS: lastAppended = the route tail (advances on every fix that passes
  // the segment filters, INCLUDING sub-distance-gate ones); lastCounted = the distance-gate anchor
  // (advances only when distance is actually banked). The split is what lets a slow drift accumulate
  // against ONE counted origin while the segment filters still compare consecutive fixes — exactly
  // the JS previousPoint / lastCountedPoint pair.
  private var lastAppended: CLLocation?
  private var lastCounted: CLLocation?

  // Cold-start warmup buffer (mirrors JS coldStartFixBuffer): fixes collected BEFORE the first
  // anchor. Once coldStartStableFixCount recent fixes form a tight cluster, the anchor is the
  // cluster's LAST fix and the intra-cluster path is banked as ZERO — the JS cold-start seed=0
  // semantics that killed the ~0.3km start spike.
  private var coldStartBuffer: [CLLocation] = []

  // Running total in meters, guarded for the cross-thread synchronous read.
  private var total: Double = 0
  private let lock = NSLock()

  // Synchronous, thread-safe read of the running total in meters.
  var totalMeters: Double {
    lock.lock()
    defer { lock.unlock() }
    return total
  }

  // Apply the JS filter constants. The original six fall back to the JS-source defaults above when
  // missing/garbled (the gate can never be accidentally disabled); the later-added constants stay
  // nil (gate disabled) unless actually delivered — the old-bundle parity contract.
  func configure(options: [String: Any]) {
    maxAccuracyMeters = DistanceAccumulator.doubleOption(options, "maxAccuracyMeters") ?? maxAccuracyMeters
    distanceGateBaseMeters = DistanceAccumulator.doubleOption(options, "distanceGateBaseMeters") ?? distanceGateBaseMeters
    distanceGateAccuracyScale = DistanceAccumulator.doubleOption(options, "distanceGateAccuracyScale") ?? distanceGateAccuracyScale
    teleportMinMeters = DistanceAccumulator.doubleOption(options, "teleportMinMeters") ?? teleportMinMeters
    maxSpeedMps = DistanceAccumulator.doubleOption(options, "maxSpeedMps") ?? maxSpeedMps
    maxLocationAgeMs = DistanceAccumulator.doubleOption(options, "maxLocationAgeMs") ?? maxLocationAgeMs

    minTimeDeltaMs = DistanceAccumulator.doubleOption(options, "minTimeDeltaMs")
    teleportAccuracyScale = DistanceAccumulator.doubleOption(options, "teleportAccuracyScale")
    teleportMaxSpeedMps = DistanceAccumulator.doubleOption(options, "teleportMaxSpeedMps")
    stationarySpeedMps = DistanceAccumulator.doubleOption(options, "stationarySpeedMps")
    poorAccuracyMeters = DistanceAccumulator.doubleOption(options, "poorAccuracyMeters")
    if let rawCount = DistanceAccumulator.doubleOption(options, "coldStartStableFixCount") {
      // A count outside the buffer's reach could never form a cluster (native distance would stay
      // frozen), so a garbled value disables the warmup instead of bricking accumulation.
      let count = Int(rawCount.rounded())
      coldStartStableFixCount = (2...DistanceAccumulator.coldStartMaxBufferFixes).contains(count) ? count : nil
    } else {
      coldStartStableFixCount = nil
    }
    coldStartMaxClusterRadiusMeters = DistanceAccumulator.doubleOption(options, "coldStartMaxClusterRadiusMeters")
    coldStartMaxAccuracyMeters = DistanceAccumulator.doubleOption(options, "coldStartMaxAccuracyMeters")
    coldStartMaxWindowMs = DistanceAccumulator.doubleOption(options, "coldStartMaxWindowMs")
    minMovementMeters = DistanceAccumulator.doubleOption(options, "minMovementMeters") ?? 3.0
    maxFutureLocationMs = DistanceAccumulator.doubleOption(options, "maxFutureLocationMs")
  }

  // Begin a session: drop the anchors + warmup buffer so the session re-runs the cold-start warmup
  // (or, on an old wire format, re-anchors on the first accepted fix — no initial jump either way).
  // The running total is PRESERVED so a same-run re-start does not lose accrued distance — the JS
  // side seeds the baseline separately via seed(meters:).
  func beginSession() {
    lastAppended = nil
    lastCounted = nil
    coldStartBuffer.removeAll()
  }

  // Set the running total to the JS authoritative total at start so native and JS share one origin.
  func seed(meters: Double) {
    lock.lock()
    total = meters.isFinite && meters > 0 ? meters : 0
    lock.unlock()
  }

  // Full reset (new run): zero the total, drop the anchors + warmup buffer.
  func reset() {
    lastAppended = nil
    lastCounted = nil
    coldStartBuffer.removeAll()
    lock.lock()
    total = 0
    lock.unlock()
  }

  // Consume one delivered fix. Returns the NEW total in meters when the fix advanced the distance,
  // or nil when the fix was rejected/gated (so the caller only emits onDistanceAccumulated on a real
  // advance). Mirrors the JS appendTrackedLocation chain in the SAME order:
  //   accuracy → age window → cold-start warmup → min time delta → teleport (hard +
  //   accuracy-scaled) → stationary/poor-accuracy noise → accuracy-scaled distance gate → count.
  // Distances are CoreLocation's geodesic distance(from:) — matching the JS haversine within GPS
  // noise, battery-free.
  func consume(location current: CLLocation) -> Double? {
    let accuracy = current.horizontalAccuracy
    // FAIL CLOSED: a negative horizontalAccuracy means Core Location could not produce a radius —
    // reject rather than letting an accuracy-less fix slide under the smallest gate (mirrors
    // normalizeAccuracyMeters + the JS MAX_TRACKING_ACCURACY_METERS drop).
    if accuracy < 0 || accuracy > maxAccuracyMeters {
      return nil
    }

    // Age window (JS resolveLocationTimestampMs): stale-past fixes beyond maxLocationAgeMs and
    // future-stamped fixes beyond maxFutureLocationMs are clock artifacts. An absent
    // maxFutureLocationMs keeps the previous binary's symmetric window. CLLocation.timestamp is
    // wall-clock; compare to now in ms.
    let pastMs = Date().timeIntervalSince(current.timestamp) * 1000.0
    if pastMs > maxLocationAgeMs {
      return nil
    }
    if -pastMs > (maxFutureLocationMs ?? maxLocationAgeMs) {
      return nil
    }

    // Cold-start warmup (JS buildStableColdStartRouteCandidate + the seed=0 anchor): before the
    // first anchor, buffer fixes until a tight stable cluster forms, anchor at its LAST fix, and
    // bank NOTHING for the intra-cluster path.
    guard let previous = lastAppended else {
      handleColdStart(current)
      return nil
    }

    let segmentMeters = current.distance(from: previous)
    let dtSeconds = current.timestamp.timeIntervalSince(previous.timestamp)
    let dtMs = dtSeconds * 1000.0

    // Min time delta (JS MIN_LOCATION_TIME_DELTA_MS): sub-cadence duplicate fixes are noise.
    if let minTimeDeltaMs = minTimeDeltaMs, dtMs < minTimeDeltaMs {
      return nil
    }

    let lastAccuracy = previous.horizontalAccuracy
    let worstAccuracy = max(lastAccuracy >= 0 ? lastAccuracy : 0, accuracy)

    // Teleport 1 (hard — JS MIN_TELEPORT_FILTER_DISTANCE_METERS + MAX_REASONABLE_RUNNING_SPEED_MPS):
    // a long segment covered impossibly fast is a GPS jump — drop it and do NOT advance the anchor,
    // so the next in-range fix re-anchors off the last good position.
    if segmentMeters >= teleportMinMeters && dtSeconds > 0 && (segmentMeters / dtSeconds) > maxSpeedMps {
      return nil
    }

    // Teleport 2 (accuracy-scaled): a jump longer than max(teleportMin, worstAccuracy * scale)
    // moving faster than teleportMaxSpeedMps is GPS relocation, not running.
    if
      let teleportAccuracyScale = teleportAccuracyScale,
      let teleportMaxSpeedMps = teleportMaxSpeedMps,
      dtSeconds > 0,
      segmentMeters > max(teleportMinMeters, worstAccuracy * teleportAccuracyScale),
      (segmentMeters / dtSeconds) > teleportMaxSpeedMps
    {
      return nil
    }

    // Stationary / poor-accuracy noise rejection (JS shouldIgnoreNoisySegment), including the
    // dynamic min-movement floor.
    if let stationarySpeedMps = stationarySpeedMps, let poorAccuracyMeters = poorAccuracyMeters {
      let dynamicMinMovementMeters = max(minMovementMeters, min(4.5, worstAccuracy * 0.1))
      if segmentMeters < dynamicMinMovementMeters {
        return nil
      }

      let segmentSpeedMps = dtSeconds > 0 ? segmentMeters / dtSeconds : Double.infinity
      // CLLocation.speed is negative when invalid; the JS normalizeReliableSpeedMps range check
      // rejects it the same way.
      let rawSpeedMps = current.speed
      let speedIsReliable = rawSpeedMps >= DistanceAccumulator.minReliableSpeedMps && rawSpeedMps <= maxSpeedMps
      let reliableSpeedMps: Double? = speedIsReliable ? rawSpeedMps : nil

      let reliableLooksStationary = reliableSpeedMps.map { $0 < stationarySpeedMps } ?? false
      let looksStationary = reliableLooksStationary || segmentSpeedMps < stationarySpeedMps
      let stationaryNoiseRadiusMeters = max(4.0, min(12.0, worstAccuracy * 0.35))
      if looksStationary && segmentMeters < stationaryNoiseRadiusMeters {
        return nil
      }

      let poorAccuracyNoiseRadiusMeters = min(12.0, worstAccuracy * 0.25)
      if worstAccuracy >= poorAccuracyMeters && segmentSpeedMps < 1.4 && segmentMeters < poorAccuracyNoiseRadiusMeters {
        return nil
      }
    }

    // Distance gate (JS resolveDistanceGateMeters), measured from the COUNTED anchor: below the
    // gate is jitter, not movement. Mirror JS: the fix still becomes the segment anchor (JS appends
    // it to the route) but the counted anchor stays, so a slow drift accumulates until it crosses
    // the gate from the SAME counted origin.
    let countedAnchor: CLLocation
    if let lastCountedFix = lastCounted {
      countedAnchor = lastCountedFix
    } else {
      countedAnchor = previous
      lastCounted = previous
    }
    let gate = distanceGateBaseMeters + max(0, worstAccuracy) * distanceGateAccuracyScale
    let distanceFromCountedMeters = current.distance(from: countedAnchor)

    if distanceFromCountedMeters < gate {
      lastAppended = current
      return nil
    }

    lock.lock()
    total += distanceFromCountedMeters
    let newTotal = total
    lock.unlock()
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
  private func handleColdStart(_ current: CLLocation) {
    guard
      let stableFixCount = coldStartStableFixCount,
      let clusterRadiusMeters = coldStartMaxClusterRadiusMeters,
      let maxStableAccuracyMeters = coldStartMaxAccuracyMeters,
      let maxWindowMs = coldStartMaxWindowMs
    else {
      lastAppended = current
      lastCounted = current
      return
    }

    coldStartBuffer.append(current)
    if coldStartBuffer.count > DistanceAccumulator.coldStartMaxBufferFixes {
      coldStartBuffer.removeFirst(coldStartBuffer.count - DistanceAccumulator.coldStartMaxBufferFixes)
    }
    if coldStartBuffer.count < stableFixCount {
      return
    }

    let recent = Array(coldStartBuffer.suffix(stableFixCount))
    guard let firstFix = recent.first, let lastFix = recent.last else {
      return
    }
    let windowMs = lastFix.timestamp.timeIntervalSince(firstFix.timestamp) * 1000.0
    if windowMs <= 0 || windowMs > maxWindowMs {
      return
    }
    if recent.contains(where: { $0.horizontalAccuracy >= 0 && $0.horizontalAccuracy > maxStableAccuracyMeters }) {
      return
    }

    var maxPairDistanceMeters: Double = 0
    for leftIndex in 0..<(recent.count - 1) {
      for rightIndex in (leftIndex + 1)..<recent.count {
        maxPairDistanceMeters = max(maxPairDistanceMeters, recent[rightIndex].distance(from: recent[leftIndex]))
      }
    }
    if maxPairDistanceMeters > clusterRadiusMeters {
      return
    }

    // STABLE: anchor at the cluster's last fix; the intra-cluster warmup path is banked as ZERO
    // (the JS cold-start seed=0 that killed the start spike — the JS merge seeds the baseline).
    lastAppended = lastFix
    lastCounted = lastFix
    coldStartBuffer.removeAll()
  }

  // JS numbers can surface as Double, Int, or NSNumber depending on how Expo bridges the options
  // dictionary — coerce all three so a constant is never silently dropped back to its default.
  // Non-finite values (NaN/Inf) are treated as ABSENT, mirroring the Kotlin reader: a NaN here
  // would trap in Int(rounded()) and, worse, fail every `x > NaN` gate comparison OPEN — the
  // binary is frozen while options arrive over OTA, so a garbled option must never widen a gate.
  private static func doubleOption(_ options: [String: Any], _ key: String) -> Double? {
    let coerced: Double?
    if let number = options[key] as? NSNumber {
      coerced = number.doubleValue
    } else if let value = options[key] as? Double {
      coerced = value
    } else if let value = options[key] as? Int {
      coerced = Double(value)
    } else {
      coerced = nil
    }

    guard let value = coerced, value.isFinite else {
      return nil
    }

    return value
  }
}
