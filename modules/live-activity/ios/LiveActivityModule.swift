import ExpoModulesCore
import Foundation

#if canImport(ActivityKit)
import ActivityKit
#endif

// REAL iOS Live Activity bridge — the native counterpart of modules/live-activity/index.ts.
//
// Parity with the JS bridge (read both files together):
//   - Same Expo Module Name("LiveActivityModule") the JS resolves via requireNativeModule.
//   - Same `available` OTA-SAFETY marker the JS gate probes: ONLY this real module exposes it, so
//     isLiveActivityAvailable() returns true ONLY on this native build. The old binaries have no
//     LiveActivityModule linked at all → requireNativeModule throws → JS stays unavailable → every
//     wrapper no-ops → the OTA bundle is safe.
//   - Same function surface: isLiveActivityAvailable / startLiveActivity / updateLiveActivity /
//     endLiveActivity, with argument shapes that mirror the TS LiveActivityAttributes /
//     LiveActivityContentState field-for-field (see RunActivityAttributes.swift in the widget
//     target, which declares the ActivityKit-visible structs the SAME way).
//
// iOS 16.2+ GATE: ActivityKit's pushType-less Activity.request(attributes:content:) and
// Activity.update(_:) require iOS 16.2. EVERY ActivityKit touch is wrapped in
// `#available(iOS 16.2, *)`; on pre-16.2 every function no-ops (isLiveActivityAvailable returns
// false), so the app runs fine and simply shows no card. We also bail when the user has disabled
// Live Activities (ActivityAuthorizationInfo().areActivitiesEnabled).
//
// FIRE-AND-FORGET: these are plain `Function`s (synchronous, no Promise). They never throw back into
// JS — the controller already wraps each call in try/catch and never awaits, so a failed start/
// update/end can never perturb the bg-sync promise / throttle / inflight guards.
public class LiveActivityModule: Module {
  // The single in-flight Live Activity for the current run. Held as Any? so the property exists on
  // every deployment target; it is only ever cast to Activity<RunActivityAttributes> behind a
  // `#available(iOS 16.2, *)` guard. nil when no card is showing.
  private var currentActivityBox: Any?

  public func definition() -> ModuleDefinition {
    Name("LiveActivityModule")

    // OTA-SAFETY availability marker (see index.ts). Only this real module exposes it; the old
    // no-op binary has no LiveActivityModule at all, so iOS availability stays false there. We also
    // fold the runtime capability check in: false on pre-16.2 OR when the user disabled Live
    // Activities, so JS never tries to start a card the OS would reject.
    Property("available") {
      return Self.activitiesSupported()
    }

    // Mirrors index.ts isLiveActivityAvailable(): true only on iOS 16.2+ with Live Activities
    // enabled. Exposed as a Function too so JS can re-probe at call time if it wants.
    Function("isLiveActivityAvailable") { () -> Bool in
      return Self.activitiesSupported()
    }

    // Start the lock-screen / Dynamic Island card. attrs = static LiveActivityAttributes, state =
    // initial LiveActivityContentState. Both arrive as the Records below, which mirror the TS types.
    // NAME PARITY: index.ts probes `nativeModule.start/update/end` — these export names MUST match.
    Function("start") { (attrs: LiveActivityAttributesRecord, state: LiveActivityContentStateRecord) in
      self.startActivity(attrs: attrs, state: state)
    }

    // Push a fresh content state to the running card.
    Function("update") { (state: LiveActivityContentStateRecord) in
      self.updateActivity(state: state)
    }

    // End + dismiss the running card.
    Function("end") {
      self.endActivity()
    }

    // Safety: if the JS context is torn down (app backgrounded into suspension / reload) we do NOT
    // end the activity here — the run may still be going and the card must persist. Teardown is an
    // explicit endLiveActivity() from the run lifecycle.
  }

  // MARK: - Capability

  // True only when ActivityKit can actually run a Live Activity: iOS 16.2+, ActivityKit present,
  // and the user has Live Activities enabled. Used by both `available` and isLiveActivityAvailable.
  private static func activitiesSupported() -> Bool {
    #if canImport(ActivityKit)
    if #available(iOS 16.2, *) {
      return ActivityAuthorizationInfo().areActivitiesEnabled
    }
    return false
    #else
    return false
    #endif
  }

  // MARK: - Lifecycle

  private func startActivity(attrs: LiveActivityAttributesRecord, state: LiveActivityContentStateRecord) {
    #if canImport(ActivityKit)
    if #available(iOS 16.2, *) {
      guard ActivityAuthorizationInfo().areActivitiesEnabled else {
        return
      }

      // Idempotent: if a card is already running (e.g. a JS double-start), update it instead of
      // requesting a second Activity. Mirrors the JS controller's liveActivityStarted guard.
      if let existing = currentActivityBox as? Activity<RunActivityAttributes> {
        Task {
          await existing.update(ActivityContent(state: state.toContentState(), staleDate: state.staleDate()))
        }
        return
      }

      let attributes = attrs.toAttributes()
      let content = ActivityContent(state: state.toContentState(), staleDate: state.staleDate())

      do {
        // pushType: nil → we drive updates locally via activity.update(_:); no remote push token.
        let activity = try Activity<RunActivityAttributes>.request(
          attributes: attributes,
          content: content,
          pushType: nil
        )
        currentActivityBox = activity
      } catch {
        // Best-effort: a failed start must never break the run. Leave currentActivityBox nil so a
        // later update no-ops and a later start can retry.
        currentActivityBox = nil
      }
    }
    #endif
  }

  private func updateActivity(state: LiveActivityContentStateRecord) {
    #if canImport(ActivityKit)
    if #available(iOS 16.2, *) {
      guard let activity = currentActivityBox as? Activity<RunActivityAttributes> else {
        return
      }
      let content = ActivityContent(state: state.toContentState(), staleDate: state.staleDate())
      Task {
        await activity.update(content)
      }
    }
    #endif
  }

  private func endActivity() {
    #if canImport(ActivityKit)
    if #available(iOS 16.2, *) {
      guard let activity = currentActivityBox as? Activity<RunActivityAttributes> else {
        currentActivityBox = nil
        return
      }
      currentActivityBox = nil
      Task {
        // .immediate dismissal: the run is over, remove the card now rather than letting it linger.
        await activity.end(nil, dismissalPolicy: .immediate)
      }
    }
    #endif
  }
}

// MARK: - JS-bridged Records

// These Records are the Expo-bridged shapes JS passes in. They mirror the TS LiveActivityAttributes
// / LiveActivityContentState field-for-field, then convert into the ActivityKit-visible structs
// (RunActivityAttributes / .ContentState) declared in the widget target. Keeping the bridged Record
// SEPARATE from the ActivityKit struct lets this file compile on any deployment target (Records are
// plain ExpoModulesCore types; the ActivityKit structs are only referenced behind #available).

// Mirrors TS LiveActivityAttributes (static, set once at start).
struct LiveActivityAttributesRecord: Record {
  @Field var matchId: String?
  @Field var mode: String = "solo"
  @Field var goalDistanceKm: Double?
  @Field var runnerNames: [String] = []
  @Field var startedAt: String = ""
}

// Mirrors TS LiveActivityRunner.
struct LiveActivityRunnerRecord: Record {
  @Field var name: String = ""
  @Field var progress0to1: Double = 0
  @Field var isMe: Bool = false
}

// Mirrors TS LiveActivityContentState (live, frequently updated). Match-only fields are optional.
struct LiveActivityContentStateRecord: Record {
  @Field var elapsedSeconds: Double = 0
  @Field var distanceM: Double = 0
  @Field var paceText: String = "--:--/km"
  @Field var staleDateMs: Double = 0
  // Whether the run is ACTIVELY counting right now. Drives the card's native auto-ticking TIME:
  // true → the card ticks the clock itself from timerStartMs (JS-independent on the lock screen);
  // false → TIME freezes at the last pushed elapsedSeconds. Defaults to true so a JS bundle that
  // does not send the field (or a pre-isRunning OTA) keeps the clock ticking exactly as before.
  @Field var isRunning: Bool = true
  // PAUSE-AWARE timer anchor as an absolute epoch-ms (TS timerStartMs = pushTimeMs −
  // elapsedSeconds*1000). The card runs Text(timerInterval: Date(timerStartMs)…) from this anchor
  // while running, so the displayed time excludes paused gaps and re-syncs on every push. Defaults
  // to 0 so a pre-timerStartMs OTA (or any caller that omits it) → the card falls back to the
  // static elapsedSeconds render instead of anchoring the timer to an invalid epoch.
  @Field var timerStartMs: Double = 0
  @Field var myRank: Int?
  @Field var totalRunners: Int?
  @Field var adjacentGapText: String?
  @Field var runners: [LiveActivityRunnerRecord]?
}

#if canImport(ActivityKit)
@available(iOS 16.2, *)
extension LiveActivityAttributesRecord {
  func toAttributes() -> RunActivityAttributes {
    return RunActivityAttributes(
      matchId: matchId,
      mode: mode,
      goalDistanceKm: goalDistanceKm,
      runnerNames: runnerNames,
      startedAt: startedAt
    )
  }
}

@available(iOS 16.2, *)
extension LiveActivityContentStateRecord {
  func toContentState() -> RunActivityAttributes.ContentState {
    let mappedRunners: [RunActivityAttributes.Runner]? = runners?.map { runner in
      RunActivityAttributes.Runner(
        name: runner.name,
        progress0to1: runner.progress0to1,
        isMe: runner.isMe
      )
    }
    return RunActivityAttributes.ContentState(
      // JS sends whole seconds/meters as numbers; clamp to non-negative Ints for the card.
      elapsedSeconds: Int(max(0, elapsedSeconds)),
      distanceM: Int(max(0, distanceM)),
      paceText: paceText,
      staleDateMs: staleDateMs,
      isRunning: isRunning,
      timerStartMs: timerStartMs,
      myRank: myRank,
      totalRunners: totalRunners,
      adjacentGapText: adjacentGapText,
      runners: mappedRunners
    )
  }

  // Wall-clock staleDate: after this the OS dims the card (the JS view-model sets ~10s ahead).
  func staleDate() -> Date? {
    guard staleDateMs > 0 else {
      return nil
    }
    return Date(timeIntervalSince1970: staleDateMs / 1000.0)
  }
}
#endif
