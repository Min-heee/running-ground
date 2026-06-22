import Foundation
import ActivityKit

// SHARED ActivityKit attributes for the RunningGround Live Activity.
//
// This file lives in targets/live-activity/_shared/ so @bacons/apple-targets links it into BOTH:
//   1. the WIDGET target (which renders the card from RunActivityAttributes + .ContentState), and
//   2. the MAIN APP target (where modules/live-activity/ios/LiveActivityModule.swift calls
//      Activity<RunActivityAttributes>.request / .update / .end).
// ActivityKit requires the EXACT same attributes type in both targets, so a single shared source of
// truth here prevents the two from drifting.
//
// MIRRORS THE TS CONTRACT field-for-field (modules/live-activity/index.ts):
//   - Attributes (static)  ↔ TS LiveActivityAttributes
//   - ContentState (live)  ↔ TS LiveActivityContentState
//   - Runner               ↔ TS LiveActivityRunner
// The bridge's LiveActivityContentStateRecord / LiveActivityAttributesRecord convert the JS payload
// into these. Field NAMES match the TS names so the mapping in the bridge is 1:1.
//
// Gated to iOS 16.2 (ActivityAttributes + the pushType-less request/update API). The whole file is
// compiled only when ActivityKit is available; on the main app target the references are already
// behind `#available(iOS 16.2, *)` in LiveActivityModule.swift.
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
