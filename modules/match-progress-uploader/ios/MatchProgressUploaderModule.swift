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

    // MARK: Native distance accumulator (screen-off distance advance)

    // Begin native GPS distance accumulation, wiring the SAME location driver that already runs the
    // periodic re-POST (no new CLLocationManager / no new stream). The filter constants mirror JS
    // 1:1. start resets the per-fix anchor (last=nil) so the FIRST fix only sets the origin — the
    // JS merge seeds the total separately via seedDistanceAccumulator. Returns true when the native
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
      onLocation: { [weak self] location in
        // Feed every delivered fix into the distance accumulator. It self-gates on the want-flag so
        // a driver kept alive purely for the periodic re-POST does not accrue distance.
        guard let self = self, self.distanceWantsLocation else {
          return
        }
        if let advancedMeters = self.distanceAccumulator.consume(location: location) {
          self.sendEvent("onDistanceAccumulated", ["meters": advancedMeters])
        }
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
  // Per-fix hook so the module can feed the distance accumulator from this SAME location stream
  // (no second CLLocationManager). Invoked on the main thread for every delivered location.
  private let onLocation: (CLLocation) -> Void

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
    emit: @escaping (String) -> Void,
    onLocation: @escaping (CLLocation) -> Void
  ) {
    self.intervalSeconds = intervalSeconds
    self.send = send
    self.emit = emit
    self.onLocation = onLocation
    super.init()
  }

  func updatePayload(url: String, authToken: String, jsonBody: String) {
    self.url = url
    self.token = authToken
    self.body = jsonBody
  }

  // Clear ONLY the cached re-POST payload (used when the periodic re-POST stops but the distance
  // accumulator still needs the shared location stream). maybePost() then early-returns on the nil
  // payload, so no POST fires, while didUpdateLocations keeps feeding the accumulator.
  func clearPayload() {
    self.url = nil
    self.token = nil
    self.body = nil
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

// MARK: - DistanceAccumulator

// Native running-total distance, advanced from the SAME location stream as the periodic re-POST so
// a run's distance keeps moving while the JS thread is suspended (screen off). Mirrors the JS filter
// chain (src/features/runs/tracking/background/locationDistance.ts + routeAccumulator.ts) 1:1, but
// pared down to the per-segment gate the screen-off case needs — it intentionally does NOT replicate
// JS's route-history cold-start / jitter-collapse passes (those re-walk the whole route, which the
// native side does not keep). The JS pipeline stays the authoritative total in the foreground; the
// JS merge takes max(jsKm, nativeKm) so this conservative-by-design total can only ADD distance JS
// missed while suspended, never subtract or jump JS backward.
//
// Threading: configure/seed/reset/beginSession/consume are all invoked on the MAIN thread (Core
// Location callbacks + the runOnMain-marshalled Expo Functions). The synchronous totalMeters read
// can come from any thread (Expo Function bodies may run off-main), so the total is guarded by an
// NSLock (Foundation — already imported) — a single Double load/store, no GPS work under the lock.
private final class DistanceAccumulator {
  // JS filter constants, injected from JS so the two pipelines stay in lockstep. Defaults mirror the
  // JS source values so a missing/garbled option can never widen the gate open.
  private var maxAccuracyMeters: Double = 60
  private var distanceGateBaseMeters: Double = 2.5
  private var distanceGateAccuracyScale: Double = 0.15
  private var teleportMinMeters: Double = 35
  private var maxSpeedMps: Double = 8.5
  private var maxLocationAgeMs: Double = 15000

  // The last COUNTED fix (the distance-gate anchor — mirrors JS lastCountedPoint). nil until the
  // first accepted fix, so the first fix only sets the anchor (no initial jump).
  private var lastCounted: CLLocation?

  // Running total in meters, guarded for the cross-thread synchronous read.
  private var total: Double = 0
  private let lock = NSLock()

  // Synchronous, thread-safe read of the running total in meters.
  var totalMeters: Double {
    lock.lock()
    defer { lock.unlock() }
    return total
  }

  // Apply the JS filter constants. Unknown/garbled values fall back to the JS defaults above, so the
  // gate can never be accidentally disabled.
  func configure(options: [String: Any]) {
    if let value = options["maxAccuracyMeters"] as? Double { maxAccuracyMeters = value }
    if let value = options["distanceGateBaseMeters"] as? Double { distanceGateBaseMeters = value }
    if let value = options["distanceGateAccuracyScale"] as? Double { distanceGateAccuracyScale = value }
    if let value = options["teleportMinMeters"] as? Double { teleportMinMeters = value }
    if let value = options["maxSpeedMps"] as? Double { maxSpeedMps = value }
    if let value = options["maxLocationAgeMs"] as? Double { maxLocationAgeMs = value }
  }

  // Begin a session: drop the per-fix anchor so the FIRST fix after start only sets the origin (no
  // initial jump). The running total is PRESERVED so a same-run re-start does not lose accrued
  // distance — the JS side seeds the baseline separately via seed(meters:).
  func beginSession() {
    lastCounted = nil
  }

  // Set the running total to the JS authoritative total at start so native and JS share one origin.
  func seed(meters: Double) {
    lock.lock()
    total = meters.isFinite && meters > 0 ? meters : 0
    lock.unlock()
  }

  // Full reset (new run): zero the total and drop the anchor.
  func reset() {
    lastCounted = nil
    lock.lock()
    total = 0
    lock.unlock()
  }

  // Consume one delivered fix. Returns the NEW total in meters when the fix advanced the distance,
  // or nil when the fix was rejected/gated (so the caller only emits onDistanceAccumulated on a real
  // advance). Mirrors the JS appendTrackedLocation per-segment path:
  //   - reject horizontalAccuracy < 0 (invalid) or > maxAccuracyMeters (MAX_TRACKING_ACCURACY_METERS)
  //   - reject if abs(now - timestamp) > maxLocationAgeMs (resolveLocationTimestampMs age window)
  //   - first accepted fix only sets the anchor (no jump)
  //   - segment = current.distance(from: last) — CoreLocation's geodesic (battery-free), matching
  //     the JS haversine within GPS noise
  //   - gate = distanceGateBaseMeters + worstAccuracy * distanceGateAccuracyScale; skip if seg < gate
  //   - teleport: skip if seg >= teleportMinMeters AND seg/dt > maxSpeedMps
  //   - else total += seg, advance the anchor, return the new total
  func consume(location current: CLLocation) -> Double? {
    let accuracy = current.horizontalAccuracy
    // Reject invalid (negative) or too-coarse fixes (mirrors normalizeAccuracyMeters + the JS
    // MAX_TRACKING_ACCURACY_METERS drop).
    if accuracy < 0 || accuracy > maxAccuracyMeters {
      return nil
    }

    // Reject stale/future fixes (mirrors resolveLocationTimestampMs's age window). CLLocation.timestamp
    // is wall-clock; compare to now in ms.
    let ageMs = abs(Date().timeIntervalSince(current.timestamp)) * 1000.0
    if ageMs > maxLocationAgeMs {
      return nil
    }

    guard let last = lastCounted else {
      // First accepted fix: set the anchor only. No distance is added (no initial jump), matching
      // the JS "previousPoint == null" cold-start that just seeds lastCountedPoint.
      lastCounted = current
      return nil
    }

    let segmentMeters = current.distance(from: last)
    let worstAccuracy = max(last.horizontalAccuracy >= 0 ? last.horizontalAccuracy : 0, accuracy >= 0 ? accuracy : 0)
    let gate = distanceGateBaseMeters + worstAccuracy * distanceGateAccuracyScale

    // Distance gate (mirrors resolveDistanceGateMeters): below the gate is GPS noise, not movement —
    // do NOT advance the anchor (JS keeps the same lastCountedPoint), so a slow drift accumulates
    // until it crosses the gate from the SAME anchor.
    if segmentMeters < gate {
      return nil
    }

    // Teleport filter (mirrors the JS MIN_TELEPORT_FILTER_DISTANCE_METERS + MAX_REASONABLE_RUNNING_SPEED_MPS
    // drop): a long segment covered impossibly fast is a GPS jump — drop it and do NOT advance the
    // anchor, so the next in-range fix re-anchors off the last good position.
    let dtSeconds = current.timestamp.timeIntervalSince(last.timestamp)
    if segmentMeters >= teleportMinMeters && dtSeconds > 0 && (segmentMeters / dtSeconds) > maxSpeedMps {
      return nil
    }

    lock.lock()
    total += segmentMeters
    let newTotal = total
    lock.unlock()
    lastCounted = current
    return newTotal
  }
}
