import SwiftUI
import WidgetKit
import ActivityKit

// The RunningGround Live Activity: lock-screen card + Dynamic Island.
//
// Renders RunActivityAttributes (static) + .ContentState (live) — both declared in
// targets/live-activity/_shared/RunActivityAttributes.swift and mirroring the TS contract. The JS
// view-model (buildLiveCardState.ts) has already done ALL the math (rank, adjacent gap, top-3+me,
// pace text, stale date); this view ONLY presents it.
//
// LOCKED DESIGN:
//   - solo: time / AVG pace / distance (progress ring only when goalDistanceKm is set).
//   - match: top-3+me rank bar + "N위" + adjacent gap ("-12m" / "+5m").
//   - dark style to match the app.
//   - the OS dims the card automatically after the ContentState's staleDate (set by the bridge).

// MARK: - Palette (app dark style)

private enum CardPalette {
  static let background = Color(red: 0.05, green: 0.06, blue: 0.10)
  static let surface = Color.white.opacity(0.06)
  static let primaryText = Color.white
  static let secondaryText = Color.white.opacity(0.65)
  static let accent = Color(red: 0.36, green: 0.55, blue: 1.0) // RunningGround blue
  static let meHighlight = Color(red: 0.36, green: 0.55, blue: 1.0)
  static let trackEmpty = Color.white.opacity(0.12)
}

// MARK: - Formatting helpers (presentation only)

private func formatElapsed(_ totalSeconds: Int) -> String {
  let seconds = max(0, totalSeconds)
  let hours = seconds / 3600
  let minutes = (seconds % 3600) / 60
  let secs = seconds % 60
  if hours > 0 {
    return String(format: "%d:%02d:%02d", hours, minutes, secs)
  }
  return String(format: "%02d:%02d", minutes, secs)
}

private func formatDistance(_ meters: Int) -> String {
  let safeMeters = max(0, meters)
  if safeMeters < 1000 {
    return "\(safeMeters) m"
  }
  let km = Double(safeMeters) / 1000.0
  return String(format: "%.2f km", km)
}

private func isMatch(_ attributes: RunActivityAttributes) -> Bool {
  return attributes.mode != "solo"
}

// The card's TIME view. When the run is actively counting AND we have a valid pause-aware anchor we
// render ActivityKit's native auto-ticking timer (counts UP every second, JS-independent on the lock
// screen). The anchor is `timerStartMs` (= pushTimeMs − pauseAwareElapsed*1000), re-synced on every
// push — NOT the run's wall-clock `startedAt`, which would over-count by the total paused time. When
// paused/finished — or when timerStartMs is missing/invalid (old bridge / pre-timerStartMs OTA: 0 or
// non-positive) — we render the STATIC last-pushed elapsed so the clock shows the real pause-aware
// value instead of a native timer that would keep running past a pause or anchor to epoch 0.
@available(iOS 16.2, *)
private func runTimeText(
  state: RunActivityAttributes.ContentState,
  font: Font
) -> some View {
  Group {
    if state.isRunning && state.timerStartMs > 0 {
      // count-up: from the pause-aware anchor to the far future; `countsDown: false` keeps it
      // ascending. Date(timeIntervalSince1970:) converts the epoch-ms anchor to a Date.
      let anchor = Date(timeIntervalSince1970: state.timerStartMs / 1000.0)
      Text(timerInterval: anchor...Date.distantFuture, countsDown: false)
    } else {
      Text(formatElapsed(state.elapsedSeconds))
    }
  }
  .font(font)
  .monospacedDigit()
}

// MARK: - Lock-screen card

@available(iOS 16.2, *)
struct RunLockScreenView: View {
  let context: ActivityViewContext<RunActivityAttributes>

  private var state: RunActivityAttributes.ContentState { context.state }
  private var attributes: RunActivityAttributes { context.attributes }

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      header
      if isMatch(attributes) {
        matchBody
      } else {
        soloBody
      }
    }
    .padding(16)
    .background(CardPalette.background)
    .activitySystemActionForegroundColor(CardPalette.primaryText)
  }

  private var header: some View {
    HStack {
      Text("러닝그라운드")
        .font(.caption2)
        .fontWeight(.semibold)
        .foregroundColor(CardPalette.secondaryText)
      Spacer()
      if isMatch(attributes), let rank = state.myRank {
        Text("\(rank)위")
          .font(.headline)
          .fontWeight(.bold)
          .foregroundColor(CardPalette.accent)
      }
    }
  }

  // Solo: time / AVG pace / distance, with an optional progress ring when a goal was set.
  private var soloBody: some View {
    HStack(alignment: .center, spacing: 16) {
      if let goalKm = attributes.goalDistanceKm, goalKm > 0 {
        ProgressRing(progress: progressTowardGoal(distanceM: state.distanceM, goalKm: goalKm))
          .frame(width: 56, height: 56)
      }
      HStack(spacing: 0) {
        timeMetric
        Spacer(minLength: 8)
        metric(title: "페이스", value: state.paceText.replacingOccurrences(of: "/km", with: ""))
        Spacer(minLength: 8)
        metric(title: "거리", value: formatDistance(state.distanceM))
      }
    }
  }

  // Match: rank bar (top-3 + me) + adjacent gap.
  private var matchBody: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack(spacing: 0) {
        timeMetric
        Spacer(minLength: 8)
        metric(title: "페이스", value: state.paceText.replacingOccurrences(of: "/km", with: ""))
        Spacer(minLength: 8)
        metric(title: "간격", value: state.adjacentGapText ?? "--")
      }
      if let runners = state.runners, !runners.isEmpty {
        RankBar(runners: runners)
      }
    }
  }

  private func metric(title: String, value: String) -> some View {
    VStack(alignment: .leading, spacing: 2) {
      Text(title)
        .font(.caption2)
        .foregroundColor(CardPalette.secondaryText)
      Text(value)
        .font(.system(.title3, design: .rounded))
        .fontWeight(.bold)
        .foregroundColor(CardPalette.primaryText)
        .lineLimit(1)
        .minimumScaleFactor(0.6)
    }
  }

  // The 시간 (TIME) metric — same layout as `metric` but the value is the native auto-ticking
  // clock (running) or the static last-pushed elapsed (paused/finished) instead of a plain String.
  private var timeMetric: some View {
    VStack(alignment: .leading, spacing: 2) {
      Text("시간")
        .font(.caption2)
        .foregroundColor(CardPalette.secondaryText)
      runTimeText(
        state: state,
        font: .system(.title3, design: .rounded)
      )
      .fontWeight(.bold)
      .foregroundColor(CardPalette.primaryText)
      .lineLimit(1)
      .minimumScaleFactor(0.6)
    }
  }
}

// MARK: - Rank bar (top-3 + me)

@available(iOS 16.2, *)
struct RankBar: View {
  let runners: [RunActivityAttributes.Runner]

  var body: some View {
    VStack(spacing: 6) {
      ForEach(Array(runners.enumerated()), id: \.offset) { _, runner in
        HStack(spacing: 8) {
          Text(runner.name)
            .font(.caption)
            .fontWeight(runner.isMe ? .bold : .regular)
            .foregroundColor(runner.isMe ? CardPalette.meHighlight : CardPalette.primaryText)
            .lineLimit(1)
            .frame(width: 64, alignment: .leading)
          GeometryReader { geo in
            ZStack(alignment: .leading) {
              Capsule().fill(CardPalette.trackEmpty)
              Capsule()
                .fill(runner.isMe ? CardPalette.meHighlight : CardPalette.secondaryText)
                .frame(width: max(4, geo.size.width * clampProgress(runner.progress0to1)))
            }
          }
          .frame(height: 8)
        }
      }
    }
  }
}

// MARK: - Progress ring (solo with goal)

@available(iOS 16.2, *)
struct ProgressRing: View {
  let progress: Double

  var body: some View {
    ZStack {
      Circle().stroke(CardPalette.trackEmpty, lineWidth: 6)
      Circle()
        .trim(from: 0, to: clampProgress(progress))
        .stroke(CardPalette.accent, style: StrokeStyle(lineWidth: 6, lineCap: .round))
        .rotationEffect(.degrees(-90))
      Text("\(Int((clampProgress(progress) * 100).rounded()))%")
        .font(.caption2)
        .fontWeight(.bold)
        .foregroundColor(CardPalette.primaryText)
    }
  }
}

// MARK: - Shared math

private func clampProgress(_ value: Double) -> Double {
  if !value.isFinite { return 0 }
  return min(1, max(0, value))
}

private func progressTowardGoal(distanceM: Int, goalKm: Double) -> Double {
  guard goalKm > 0 else { return 0 }
  return clampProgress((Double(distanceM) / 1000.0) / goalKm)
}

// MARK: - Widget definition (Live Activity)

@available(iOS 16.2, *)
struct RunLiveActivityWidget: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: RunActivityAttributes.self) { context in
      // Lock-screen / banner presentation.
      RunLockScreenView(context: context)
    } dynamicIsland: { context in
      let matchMode = isMatch(context.attributes)
      return DynamicIsland {
        // Expanded — the mini board.
        DynamicIslandExpandedRegion(.leading) {
          VStack(alignment: .leading, spacing: 2) {
            Text("시간")
              .font(.caption2)
              .foregroundColor(CardPalette.secondaryText)
            runTimeText(
              state: context.state,
              font: .system(.headline, design: .rounded)
            )
            .foregroundColor(CardPalette.primaryText)
          }
        }
        DynamicIslandExpandedRegion(.trailing) {
          VStack(alignment: .trailing, spacing: 2) {
            Text(matchMode ? "간격" : "거리")
              .font(.caption2)
              .foregroundColor(CardPalette.secondaryText)
            Text(matchMode
              ? (context.state.adjacentGapText ?? "--")
              : formatDistance(context.state.distanceM))
              .font(.system(.headline, design: .rounded))
              .foregroundColor(matchMode ? CardPalette.accent : CardPalette.primaryText)
          }
        }
        DynamicIslandExpandedRegion(.bottom) {
          if matchMode, let runners = context.state.runners, !runners.isEmpty {
            RankBar(runners: runners)
          } else {
            HStack {
              Text("페이스")
                .font(.caption2)
                .foregroundColor(CardPalette.secondaryText)
              Spacer()
              Text(context.state.paceText)
                .font(.system(.headline, design: .rounded))
                .foregroundColor(CardPalette.primaryText)
            }
          }
        }
      } compactLeading: {
        // Compact leading — pace.
        Text(context.state.paceText.replacingOccurrences(of: "/km", with: ""))
          .font(.caption2)
          .fontWeight(.semibold)
          .foregroundColor(CardPalette.primaryText)
      } compactTrailing: {
        // Compact trailing — rank (match) or distance (solo).
        if matchMode, let rank = context.state.myRank {
          Text("\(rank)위")
            .font(.caption2)
            .fontWeight(.bold)
            .foregroundColor(CardPalette.accent)
        } else {
          Text(formatDistance(context.state.distanceM))
            .font(.caption2)
            .fontWeight(.semibold)
            .foregroundColor(CardPalette.primaryText)
        }
      } minimal: {
        // Minimal — a single glyph; rank when in a match, else a runner mark.
        if matchMode, let rank = context.state.myRank {
          Text("\(rank)")
            .font(.caption2)
            .fontWeight(.bold)
            .foregroundColor(CardPalette.accent)
        } else {
          Image(systemName: "figure.run")
            .foregroundColor(CardPalette.accent)
        }
      }
      .keylineTint(CardPalette.accent)
    }
  }
}
