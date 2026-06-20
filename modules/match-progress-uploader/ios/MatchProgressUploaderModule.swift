import ExpoModulesCore
import Foundation

// REAL iOS uploader — mirrors the Android Kotlin MatchProgressUploaderModule's ONE-SHOT upload 1:1.
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
// NATIVE PERIODIC UPLOADER (iOS — INTENTIONAL NO-OP): iOS has NO fixed-cadence background timer, and
// the EXISTING expo-location TaskManager callback already POSTs via uploadMatchProgressNative on
// EACH background GPS fix (shipped in build 36). That callback already achieves the OS-limited
// background cadence. A module-owned SECOND CLLocationManager would add a power-hungry location
// session (and authorization/crash risk) for ~zero benefit over that existing path, so on iOS the
// periodic interface is a deliberate NO-OP: startPeriodicUpload / updatePeriodicPayload /
// stopPeriodicUpload exist (so the JS availability gate + controller wiring stay safe) but do
// nothing — no location session, no timer, no emit. The Android Kotlin module IS the real
// fixed-cadence fix (ScheduledExecutorService); iOS relies on the existing per-fix POST path.
//
// OTA-SAFETY: this build sets the `available` property to true so
// isNativeMatchProgressUploaderAvailable() returns true on iOS for the NEW binary. The OLD no-op
// Swift binary does not define `available`, so it stays unavailable and keeps the JS fetch path.
public class MatchProgressUploaderModule: Module {
  // Mirror Kotlin's 15_000ms connect/read timeouts.
  private static let timeoutSeconds: TimeInterval = 15

  // Dedicated background URLSession so the POST runs off the JS thread, mirroring Kotlin's
  // single-thread Executor. Timeouts applied at both the request and session level.
  private lazy var session: URLSession = {
    let configuration = URLSessionConfiguration.default
    configuration.timeoutIntervalForRequest = MatchProgressUploaderModule.timeoutSeconds
    configuration.timeoutIntervalForResource = MatchProgressUploaderModule.timeoutSeconds
    configuration.waitsForConnectivity = false
    return URLSession(configuration: configuration)
  }()

  public func definition() -> ModuleDefinition {
    Name("MatchProgressUploader")

    // Declared for cross-platform parity with the Android Kotlin module so the JS subscription stays
    // safe. iOS NEVER emits this (the periodic path is a no-op here), so the JS listener simply never
    // fires — harmless. The opponent board on iOS is driven by the existing per-fix POST path.
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

    // NATIVE PERIODIC UPLOADER (iOS NO-OP) — see the header comment. These exist only so the JS
    // availability gate (isNativePeriodicUploaderAvailable) and the controller's start/stop wiring
    // stay safe; they intentionally do nothing on iOS. The existing expo-location-callback →
    // uploadMatchProgressNative path is the live iOS background-upload mechanism.
    Function("startPeriodicUpload") { (_: String, _: String, _: String, _: Int) in
      // No-op on iOS: rely on the existing per-GPS-fix POST path.
    }

    Function("updatePeriodicPayload") { (_: String, _: String, _: String) in
      // No-op on iOS: nothing to cache (no native cadence runs here).
    }

    Function("stopPeriodicUpload") {
      // No-op on iOS: nothing to stop (no native cadence runs here).
    }
  }

  // Shared HTTP send. Resolves the 2xx body string (or nil on non-2xx / any error). Used by the
  // one-shot upload().
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
