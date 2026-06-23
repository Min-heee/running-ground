import Foundation
import ActivityKit

// ActivityKit attributes for the RunningGround Live Activity — the WIDGET-EXTENSION copy.
//
// WHY A COPY LIVES HERE (and not in _shared/):
//   The widget extension is a SEPARATE binary from the main app; it does NOT link the
//   modules/live-activity CocoaPods pod. So the widget needs its OWN compiled copy of the attributes
//   type for `ActivityConfiguration(for: RunActivityAttributes.self)` (RunLiveActivityWidget.swift)
//   and the SwiftUI views. This file sits directly in targets/live-activity/, so
//   @bacons/apple-targets' synchronized root group compiles it into the WIDGET target only.
//
//   It is intentionally NOT in a `_shared/` folder anymore. @bacons' `_shared/` mechanism ALSO adds
//   the file to the MAIN APP target (as a membershipException), which previously left the main app
//   WITHOUT the bridge's own definition while the bridge pod referenced the type — and would now
//   DOUBLE-define it (the LiveActivity static-framework pod already provides the type to the app).
//   Keeping this copy out of `_shared/` means: pod → main app (once), this file → widget (once).
//
// MUST STAY IDENTICAL to modules/live-activity/ios/RunActivityAttributes.swift. ActivityKit matches
// the app-side Activity to this widget's ActivityConfiguration by the type's NAME + Codable shape
// across the process boundary, not by a shared symbol — so type name, field names/types, and Codable
// conformances here MUST equal the module-pod copy exactly. They do.
//
// MIRRORS THE TS CONTRACT field-for-field (modules/live-activity/index.ts):
//   - Attributes (static)  ↔ TS LiveActivityAttributes
//   - ContentState (live)  ↔ TS LiveActivityContentState
//   - Runner               ↔ TS LiveActivityRunner
//
// The widget target's deploymentTarget is 16.2 (expo-target.config.js), so ActivityKit is always
// available here and the file imports it unconditionally; the type is still @available(iOS 16.2, *)
// to match the ActivityAttributes requirement.
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
