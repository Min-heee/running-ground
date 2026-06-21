import ExpoModulesCore
import Foundation
import CoreLocation

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
public class MatchProgressUploaderModule: Module {
  // Mirror Kotlin's 15_000ms connect/read timeouts.
  private static let timeoutSeconds: TimeInterval = 15

  // Default native cadence (matches the Android default) when JS passes a non-positive interval.
  private static let defaultIntervalMs: Int = 3000

  // Dedicated background URLSession so the POST runs off the JS thread, mirroring Kotlin's
  // single-thread Executor. Timeouts applied at both the request and session level.
  private lazy var session: URLSession = {
    let configuration = URLSessionConfiguration.default
    configuration.timeoutIntervalForRequest = MatchProgressUploaderModule.timeoutSeconds
    configuration.timeoutIntervalForResource = MatchProgressUploaderModule.timeoutSeconds
    configuration.waitsForConnectivity = false
    return URLSession(configuration: configuration)
  }()

  // The CLLocationManager-backed periodic re-POST trigger. Created in startPeriodicUpload, fully
  // torn down in stopPeriodicUpload / deinit. The locationDelegate retains the manager + holds the
  // cached payload, throttle state and single-flight flag; all of its mutable state is serialized
  // on the main thread (Core Location delivers callbacks on the thread whose run loop it was started
  // on — here the main thread), so no extra locking is needed.
  private var locationDriver: PeriodicLocationDriver?

  public func definition() -> ModuleDefinition {
    Name("MatchProgressUploader")

    // The emitter the native periodic re-POST fires with the 2xx response body string, so JS can
    // apply the opponent's live state WITHOUT a JS timer (mirrors the Android module).
    Events("onMatchProgressResponse")

    // OTA-SAFETY availability marker (see index.ts). Only the REAL module exposes this; the old
    // no-op binary does not, so iOS availability stays false there.
    Property("available") {
      true
    }

    // Mirrors Kotlin's AsyncFunction("upload") { url, authToken, jsonBody, promise -> ... }.
    AsyncFunction("upload") { (url: String, authToken: String, jsonBody: String, promise: Promise) in
      self.send(url: url, authToken: authToken, jsonBody: jsonBody) { body in
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
  }

  // MARK: - Periodic lifecycle

  private func startPeriodic(url: String, authToken: String, jsonBody: String, intervalMs: Int) {
    // Already running: refresh the payload and keep the existing location session (mirrors Kotlin's
    // "scheduledTask != null → just update payload" early return).
    if let driver = locationDriver {
      driver.updatePayload(url: url, authToken: authToken, jsonBody: jsonBody)
      return
    }

    let intervalSeconds = (intervalMs > 0 ? Double(intervalMs) : Double(MatchProgressUploaderModule.defaultIntervalMs)) / 1000.0

    let driver = PeriodicLocationDriver(
      intervalSeconds: intervalSeconds,
      send: { [weak self] sendUrl, sendToken, sendBody, completion in
        self?.send(url: sendUrl, authToken: sendToken, jsonBody: sendBody, completion: completion)
      },
      emit: { [weak self] body in
        // On a 2xx, emit the body so JS applies the opponent board WITHOUT a JS timer.
        self?.sendEvent("onMatchProgressResponse", ["body": body])
      }
    )
    locationDriver = driver
    driver.updatePayload(url: url, authToken: authToken, jsonBody: jsonBody)
    // AUTHORIZATION/CRASH-SAFETY is enforced inside start(): the driver only flips
    // allowsBackgroundLocationUpdates when status is .authorizedAlways, and no-ops the location
    // session entirely for non-authorized states so it can never crash.
    driver.start()
  }

  private func stopPeriodic() {
    // BATTERY/LIFECYCLE: fully stop + release the location session and clear the cached payload so
    // nothing keeps the GPS/CPU alive once the match ends.
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

  // MARK: - Shared HTTP send

  // Shared HTTP send. Resolves the 2xx body string (or nil on non-2xx / any error). Used by both
  // the one-shot upload() and the location-driven periodic re-POST.
  private func send(
    url urlString: String,
    authToken: String,
    jsonBody: String,
    completion: @escaping (String?) -> Void
  ) {
    guard let url = URL(string: urlString) else {
      // Mirror Kotlin: any failure resolves nil so the next tick retries (never rejects/crashes).
      completion(nil)
      return
    }

    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.timeoutInterval = MatchProgressUploaderModule.timeoutSeconds
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue("Bearer \(authToken)", forHTTPHeaderField: "Authorization")
    request.httpBody = jsonBody.data(using: .utf8)

    let task = session.dataTask(with: request) { data, response, error in
      // Mirror Kotlin's catch → null on any transport error.
      if error != nil {
        completion(nil)
        return
      }

      guard let httpResponse = response as? HTTPURLResponse else {
        completion(nil)
        return
      }

      let statusCode = httpResponse.statusCode
      // Mirror Kotlin: only hand back a body the JS side can apply; non-2xx bodies are diagnostics,
      // not state, so resolve nil for them.
      guard (200...299).contains(statusCode) else {
        completion(nil)
        return
      }

      let body = data.flatMap { String(data: $0, encoding: .utf8) }
      completion(body)
    }

    task.resume()
  }
}

// MARK: - PeriodicLocationDriver

// Owns a CLLocationManager whose location deliveries drive the periodic re-POST. All mutable state
// is touched only on the main thread (where Core Location callbacks are delivered, since the manager
// is created on the main thread), so plain stored properties are safe without extra locking.
private final class PeriodicLocationDriver: NSObject, CLLocationManagerDelegate {
  private let intervalSeconds: Double
  // The shared module HTTP send + the Expo emit, injected so the driver reuses the EXISTING send()
  // helper and never recomputes the payload.
  private let send: (String, String, String, @escaping (String?) -> Void) -> Void
  private let emit: (String) -> Void

  private var manager: CLLocationManager?

  // Latest JS-built payload (the native side only re-sends this — never recomputes it).
  private var url: String?
  private var token: String?
  private var body: String?

  // Single-flight: a delivery never overlaps an in-flight POST (mirrors the Android AtomicBoolean
  // / the JS inFlightBackgroundMatchProgressSync lock).
  private var periodicInFlight = false

  // Throttle: rate-limit re-POSTs to ~intervalSeconds using CFAbsoluteTimeGetCurrent (Foundation /
  // CoreFoundation only — NO QuartzCore/CACurrentMediaTime). 0 means "no POST yet".
  private var lastPostAt: CFAbsoluteTime = 0

  init(
    intervalSeconds: Double,
    send: @escaping (String, String, String, @escaping (String?) -> Void) -> Void,
    emit: @escaping (String) -> Void
  ) {
    self.intervalSeconds = intervalSeconds
    self.send = send
    self.emit = emit
    super.init()
  }

  func updatePayload(url: String, authToken: String, jsonBody: String) {
    self.url = url
    self.token = authToken
    self.body = jsonBody
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
    periodicInFlight = false
    lastPostAt = 0
  }

  // MARK: CLLocationManagerDelegate

  func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
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

    send(url, token, body) { [weak self] responseBody in
      guard let self = self else {
        return
      }
      // Re-enter on the main thread to clear the flag + emit, keeping all driver state single-thread.
      DispatchQueue.main.async {
        self.periodicInFlight = false
        // send() returns nil on non-2xx / failure, so the emit fires only when there is state to
        // apply — mirrors the Android `if (responseBody != null) sendEvent(...)`.
        if let responseBody = responseBody {
          self.emit(responseBody)
        }
      }
    }
  }
}
