import Foundation

#if canImport(ActivityKit)
import ActivityKit
#endif

// SHARED ActivityKit attributes for the RunningGround Live Activity — the MODULE-POD copy.
//
// WHY THIS LIVES IN THE MODULE POD (not only in the widget target):
//   modules/live-activity/ios/LiveActivityModule.swift calls
//   `Activity<RunActivityAttributes>.request/.update/.end`. Those references must resolve INSIDE the
//   LiveActivity CocoaPods pod's own compile unit. @bacons/apple-targets only links files under
//   targets/live-activity/ into the WIDGET extension (+ formerly the main app via `_shared/`), never
//   into this pod — so the pod needs its OWN definition of the type, right here. With this file the
//   pod compiles, the module registers, and requireNativeModule('LiveActivityModule') resolves.
//
// DUPLICATE-SYMBOL SAFETY (main app link graph):
//   This pod is `static_framework = true`, so this type is linked into the MAIN APP exactly once via
//   the LiveActivity static framework. The widget extension is a SEPARATE binary and compiles its
//   OWN identical copy (targets/live-activity/RunActivityAttributes.swift). The old
//   targets/live-activity/_shared/ copy was REMOVED so @bacons no longer ALSO compiles the type into
//   the main app target — that would have double-defined it in the app's link graph.
//
// ACTIVITYKIT APP↔WIDGET MATCHING:
//   ActivityKit matches a running Activity to the widget's
//   `ActivityConfiguration(for: RunActivityAttributes.self)` by the attributes type's NAME and its
//   Codable shape across the app/extension process boundary — NOT by a shared linked symbol. So this
//   pod copy and the widget copy MUST stay byte-for-byte identical in type name + field names/types
//   + Codable conformances. They are. Two compilations of an identically-named, identically-encoded
//   struct in the two binaries is the supported pattern and ActivityKit treats them as the same type.
//
// MIRRORS THE TS CONTRACT field-for-field (modules/live-activity/index.ts):
//   - Attributes (static)  ↔ TS LiveActivityAttributes
//   - ContentState (live)  ↔ TS LiveActivityContentState
//   - Runner               ↔ TS LiveActivityRunner
//
// Gated to iOS 16.2 (ActivityAttributes + the pushType-less request/update API), compiled only when
// ActivityKit is available.
#if canImport(ActivityKit)
@available(iOS 16.2, *)
public struct RunActivityAttributes: ActivityAttributes {
  // ---- Live, frequently-updated state (TS LiveActivityContentState) ----
  public struct ContentState: Codable, Hashable {
    // Whole seconds since the run's official start (TS elapsedSeconds: number).
    public var elapsedSeconds: Int
    // Whole meters (TS distanceM: number — already an int from the view-model).
    public var distanceM: Int
    // Pre-formatted AVG pace, e.g. "06:20/km" (TS paceText).
    public var paceText: String
    // Wall-clock ms after which the OS dims the card (TS staleDateMs). The bridge ALSO passes this
    // as the ActivityContent.staleDate; kept here too so the SwiftUI view can reason about it.
    public var staleDateMs: Double

    // ---- match-only (nil for solo, exactly like the TS optionals) ----
    public var myRank: Int?
    public var totalRunners: Int?
    public var adjacentGapText: String?
    public var runners: [Runner]?

    public init(
      elapsedSeconds: Int,
      distanceM: Int,
      paceText: String,
      staleDateMs: Double,
      myRank: Int? = nil,
      totalRunners: Int? = nil,
      adjacentGapText: String? = nil,
      runners: [Runner]? = nil
    ) {
      self.elapsedSeconds = elapsedSeconds
      self.distanceM = distanceM
      self.paceText = paceText
      self.staleDateMs = staleDateMs
      self.myRank = myRank
      self.totalRunners = totalRunners
      self.adjacentGapText = adjacentGapText
      self.runners = runners
    }
  }

  // One rank-bar row (TS LiveActivityRunner). Capped to top-3 + me by the JS view-model.
  public struct Runner: Codable, Hashable {
    public var name: String
    public var progress0to1: Double
    public var isMe: Bool

    public init(name: String, progress0to1: Double, isMe: Bool) {
      self.name = name
      self.progress0to1 = progress0to1
      self.isMe = isMe
    }
  }

  // ---- Static, set-once attributes (TS LiveActivityAttributes) ----
  // Present only for a match run (TS matchId?: string).
  public var matchId: String?
  // "solo" | "duel" | "group" (TS mode). Kept as String to mirror the TS union exactly.
  public var mode: String
  // Present when the run has a distance goal (TS goalDistanceKm?: number) — drives the progress ring.
  public var goalDistanceKm: Double?
  // Display names for the rank bar (TS runnerNames). Empty for solo.
  public var runnerNames: [String]
  // ISO start timestamp (TS startedAt) — the card's elapsed reference.
  public var startedAt: String

  public init(
    matchId: String? = nil,
    mode: String,
    goalDistanceKm: Double? = nil,
    runnerNames: [String],
    startedAt: String
  ) {
    self.matchId = matchId
    self.mode = mode
    self.goalDistanceKm = goalDistanceKm
    self.runnerNames = runnerNames
    self.startedAt = startedAt
  }
}
#endif
