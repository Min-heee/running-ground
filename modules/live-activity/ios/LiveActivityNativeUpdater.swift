import Foundation

#if canImport(ActivityKit)
import ActivityKit
#endif

// NATIVE, JS-INDEPENDENT Live Activity updater for the MATCH board (PACE + 간격/gap + both-runner
// board) while the screen is OFF.
//
// WHY THIS LIVES IN THE LiveActivity POD (not the match-progress-uploader pod):
//   `Activity<RunActivityAttributes>` + RunActivityAttributes.ContentState are ONLY visible inside
//   this pod's compile unit (RunActivityAttributes.swift is declared here). The uploader pod depends
//   only on ExpoModulesCore and CANNOT see those ActivityKit types. So the uploader posts a plain
//   NotificationCenter notification carrying PRIMITIVES, and THIS file — compiled where the
//   ActivityKit types are visible — turns those primitives into an `activity.update(...)`.
//
// PROCESS-GLOBAL OBSERVER (survives screen-off + module dealloc):
//   The observer is owned by a `static let shared` singleton, NOT by the Expo module instance. When
//   the screen is off and JS is suspended, the Expo module may be torn down, but the static singleton
//   (and its NotificationCenter observer) lives for the whole process, so the background re-POST in
//   the uploader pod can still drive `activity.update(...)`. `ensureRegistered()` is idempotent
//   (guarded by a static flag) and called from LiveActivityModule.start.
//
// PARITY WITH THE JS FOREGROUND PUSH (buildLiveCardState.ts / liveActivityController.ts):
//   The uploader pod mirrors the JS pure helpers EXACTLY when it builds the userInfo primitives
//   (pace text, adjacent-gap text, sorted board, top-3+me rank bar, progress0to1). THIS file does NO
//   recomputation — it only maps the already-final primitives into RunActivityAttributes.ContentState
//   field-for-field, so the background(native) push produces an IDENTICAL ContentState to the
//   foreground(JS) push and there is no jump when locking/unlocking.
//
// SAFETY:
//   - The Activity is located via the PROCESS-GLOBAL `Activity<RunActivityAttributes>.activities`
//     (NOT LiveActivityModule's private currentActivityBox, which is unreachable from here).
//   - Never clobbers a solo card: bails when `activity.attributes.mode == "solo"`.
//   - NO foreground/applicationState gate: the native push ALWAYS applies (last-writer-wins with the
//     harmless, field-identical foreground JS push). The old gate read UIApplication.applicationState
//     on the posting (main) thread and suppressed the push exactly when the lock-screen card needed
//     it; it also carried a latent DispatchQueue.main.sync deadlock if ever called off-main. See the
//     applyUpdate body for the full reasoning.
//   - ALL ActivityKit touches are wrapped in `#if canImport(ActivityKit)` + `#available(iOS 16.2,*)`,
//     so the pod still links pre-16.2 and the whole thing no-ops there.
//   - Fire-and-forget: the observer never throws back into the poster; a missing/solo/finished
//     Activity is a silent no-op.
final class LiveActivityNativeUpdater {
  // The notification the match-progress-uploader pod posts after a successful background re-POST.
  static let notificationName = Notification.Name("RGMatchProgressNativeUpdate")

  // Process-global singleton. Its init registers the observer, so the observer outlives any Expo
  // module instance (which may be deallocated while the screen is off).
  static let shared = LiveActivityNativeUpdater()

  // Idempotency guard for ensureRegistered() — `static let shared` itself is lazy/once, but this
  // makes the intent explicit and keeps a double-call a cheap no-op.
  private static var registered = false

  private init() {
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(handleMatchProgressUpdate(_:)),
      name: LiveActivityNativeUpdater.notificationName,
      object: nil
    )
  }

  // Idempotently bring the process-global observer up. Safe to call repeatedly (e.g. on every match
  // start). The first call instantiates `shared` (registering the observer); later calls no-op.
  static func ensureRegistered() {
    if registered {
      return
    }
    registered = true
    _ = LiveActivityNativeUpdater.shared
  }

  @objc private func handleMatchProgressUpdate(_ notification: Notification) {
    guard let userInfo = notification.userInfo else {
      return
    }
    applyUpdate(userInfo: userInfo)
  }

  private func applyUpdate(userInfo: [AnyHashable: Any]) {
    #if canImport(ActivityKit)
    if #available(iOS 16.2, *) {
      // Locate the running match Activity via the PROCESS-GLOBAL registry (NOT the Expo module's
      // private box, which is unreachable from this pod and may be deallocated screen-off).
      guard let activity = Activity<RunActivityAttributes>.activities.first else {
        return
      }

      // Never clobber a solo card with a match board (the uploader only posts for matches, but guard
      // anyway so a stale solo Activity can never be overwritten).
      if activity.attributes.mode == "solo" {
        return
      }

      // NO FOREGROUND GATE. The native push ALWAYS applies. The previous build gated on
      // UIApplication.shared.applicationState (only push when NOT active), reasoning that the JS
      // foreground path owns the foreground. That gate was BOTH unnecessary and the bug:
      //   1. WHY IT FROZE THE CARD SCREEN-OFF — this notification is posted from the uploader's
      //      re-POST completion, which re-enters the MAIN thread (MatchProgressUploaderModule's
      //      `DispatchQueue.main.async` in maybePost) before posting. NotificationCenter delivers
      //      synchronously on the posting thread, so applyUpdate ran on MAIN. Reading applicationState
      //      there made the push depend on a fragile foreground/background classification at exactly
      //      the moment (display off / locked, app woken only for a Core Location delivery) when that
      //      classification is least reliable — and any value of `.active`/`.inactive` it observed
      //      suppressed the very push the lock-screen card needs. The TIME kept ticking only because
      //      it is a self-driving `Text(timerInterval:)` that needs no push; PACE/간격/board are pushed
      //      state, so they stayed frozen at the start sentinel.
      //   2. WHY DROPPING IT IS SAFE — the foreground JS path (updateLiveActivity) and this native
      //      push are LAST-WRITER-WINS on the SAME Activity. A redundant native push while the app is
      //      foreground writes the SAME field-for-field ContentState the JS path would (the uploader
      //      mirrors the JS pure helpers), so there is no jump and no conflict — at worst one extra,
      //      identical activity.update.
      //   3. LATENT DEADLOCK REMOVED — the old isAppActive() did `DispatchQueue.main.sync` when called
      //      off-main. If any future caller ever posts this notification from a background thread (e.g.
      //      the maybePost completion stops hopping to main), that main.sync would DEADLOCK against a
      //      suspended main thread while the screen is off. Removing the gate removes that hazard too.
      // activity.update is itself async/cheap, so always pushing is correct and harmless.

      // Read primitives (already final — built by the uploader mirroring the JS pure helpers).
      let elapsedSeconds = intValue(userInfo["elapsedSeconds"]) ?? 0
      let distanceM = intValue(userInfo["distanceM"]) ?? 0
      let paceText = (userInfo["paceText"] as? String) ?? "--:--/km"
      let staleDateMs = doubleValue(userInfo["staleDateMs"]) ?? 0
      let isRunning = (userInfo["isRunning"] as? Bool) ?? true
      let timerStartMs = doubleValue(userInfo["timerStartMs"]) ?? 0

      // adjacentGapText: empty/absent → nil (matches the JS optional, which is omitted when there is
      // no adjacent runner). RunActivityAttributes.ContentState.adjacentGapText is String?.
      let rawGap = userInfo["adjacentGapText"] as? String
      let adjacentGapText: String? = (rawGap?.isEmpty == false) ? rawGap : nil

      let myRank = intValue(userInfo["myRank"])
      let totalRunners = intValue(userInfo["totalRunners"])

      // Rebuild the rank-bar rows from the parallel primitive arrays (names / progress0to1 / isMe),
      // which the uploader already capped to top-3+me and ordered leader-first.
      let runnerNames = (userInfo["runnerNames"] as? [String]) ?? []
      let runnerProgress = doubleArray(userInfo["runnerProgress"])
      let runnerIsMe = boolArray(userInfo["runnerIsMe"])
      let runners = buildRunners(names: runnerNames, progress: runnerProgress, isMe: runnerIsMe)

      let state = RunActivityAttributes.ContentState(
        elapsedSeconds: max(0, elapsedSeconds),
        distanceM: max(0, distanceM),
        paceText: paceText,
        staleDateMs: staleDateMs,
        isRunning: isRunning,
        timerStartMs: timerStartMs,
        myRank: myRank,
        totalRunners: totalRunners,
        adjacentGapText: adjacentGapText,
        runners: runners.isEmpty ? nil : runners
      )

      let staleDate: Date? = staleDateMs > 0 ? Date(timeIntervalSince1970: staleDateMs / 1000.0) : nil

      Task {
        await activity.update(ActivityContent(state: state, staleDate: staleDate))
      }
    }
    #endif
  }

  #if canImport(ActivityKit)
  @available(iOS 16.2, *)
  private func buildRunners(
    names: [String],
    progress: [Double],
    isMe: [Bool]
  ) -> [RunActivityAttributes.Runner] {
    let count = min(names.count, min(progress.count, isMe.count))
    guard count > 0 else {
      return []
    }
    var rows: [RunActivityAttributes.Runner] = []
    rows.reserveCapacity(count)
    for index in 0..<count {
      // Clamp progress to 0...1 to match toProgress0to1's clamp (the uploader already clamps, this is
      // a belt-and-braces guard so a garbled primitive can never push an out-of-range ring).
      let clamped = max(0.0, min(1.0, progress[index]))
      rows.append(
        RunActivityAttributes.Runner(
          name: names[index],
          progress0to1: clamped,
          isMe: isMe[index]
        )
      )
    }
    return rows
  }
  #endif

  // MARK: - Primitive coercion helpers

  // NotificationCenter userInfo values arrive as NSNumber-bridged Any; coerce defensively so a value
  // boxed as Int / Double / NSNumber all read correctly.
  private func intValue(_ value: Any?) -> Int? {
    if let intValue = value as? Int {
      return intValue
    }
    if let doubleValue = value as? Double {
      return Int(doubleValue)
    }
    if let number = value as? NSNumber {
      return number.intValue
    }
    return nil
  }

  private func doubleValue(_ value: Any?) -> Double? {
    if let doubleValue = value as? Double {
      return doubleValue
    }
    if let intValue = value as? Int {
      return Double(intValue)
    }
    if let number = value as? NSNumber {
      return number.doubleValue
    }
    return nil
  }

  private func doubleArray(_ value: Any?) -> [Double] {
    if let doubles = value as? [Double] {
      return doubles
    }
    if let numbers = value as? [NSNumber] {
      return numbers.map { $0.doubleValue }
    }
    return []
  }

  private func boolArray(_ value: Any?) -> [Bool] {
    if let bools = value as? [Bool] {
      return bools
    }
    if let numbers = value as? [NSNumber] {
      return numbers.map { $0.boolValue }
    }
    return []
  }
}
