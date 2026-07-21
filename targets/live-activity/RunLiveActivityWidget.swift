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

// Always kilometers ("0.37 km", "3.65 km") — never meters. Owner decision 2026-07-22: the card
// used to switch to "412 m" under 1 km, which reads inconsistently next to Nike/Strava cards.
private func formatDistance(_ meters: Int) -> String {
  let km = Double(max(0, meters)) / 1000.0
  return String(format: "%.2f km", km)
}

// '#RRGGBB' → Color. Anything unparseable (or nil) falls back to plain white so an old JS bundle
// that never sends rankTierColorHex renders exactly the pre-tier-color card.
private func colorFromHex(_ hex: String?) -> Color? {
  guard let hex = hex else { return nil }
  var value = hex.trimmingCharacters(in: .whitespacesAndNewlines)
  if value.hasPrefix("#") { value.removeFirst() }
  guard value.count == 6, let rgb = UInt64(value, radix: 16) else { return nil }
  return Color(
    red: Double((rgb & 0xFF0000) >> 16) / 255.0,
    green: Double((rgb & 0x00FF00) >> 8) / 255.0,
    blue: Double(rgb & 0x0000FF) / 255.0
  )
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
  // Metric numbers take the runner's RANK TIER color (owner decision 2026-07-22); a missing or
  // unparseable hex (old JS bundle) falls back to plain white.
  private var metricColor: Color {
    colorFromHex(attributes.rankTierColorHex) ?? CardPalette.primaryText
  }

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

  // Header: app name (left) · match rank + goal ring (middle-right) · app icon (top-right).
  private var header: some View {
    HStack(spacing: 10) {
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
      if !isMatch(attributes), let goalKm = attributes.goalDistanceKm, goalKm > 0 {
        ProgressRing(progress: progressTowardGoal(distanceM: state.distanceM, goalKm: goalKm))
          .frame(width: 30, height: 30)
      }
      appMark
    }
  }

  // The RunningGround app icon, top-right like Nike/Strava cards. Rendered from the widget
  // bundle's AppLogo imageset; if the asset ever goes missing the Image simply renders empty —
  // never breaks the card.
  private var appMark: some View {
    Image("AppLogo")
      .resizable()
      .scaledToFit()
      .frame(width: 24, height: 24)
      .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
  }

  // Solo: Strava-style bottom metric row — 시간(left) / 페이스(center) / 거리(right),
  // big tier-colored values with small labels UNDER them.
  private var soloBody: some View {
    metricRow(
      centerTitle: "페이스",
      centerValue: state.paceText.replacingOccurrences(of: "/km", with: ""),
      trailingTitle: "거리",
      trailingValue: formatDistance(state.distanceM)
    )
  }

  // Match: rank bar (top-3 + me) above, the same bottom metric row with 간격 on the right.
  private var matchBody: some View {
    VStack(alignment: .leading, spacing: 10) {
      if let runners = state.runners, !runners.isEmpty {
        RankBar(runners: runners)
      }
      metricRow(
        centerTitle: "페이스",
        centerValue: state.paceText.replacingOccurrences(of: "/km", with: ""),
        trailingTitle: "간격",
        trailingValue: state.adjacentGapText ?? "--"
      )
    }
  }

  private func metricRow(
    centerTitle: String,
    centerValue: String,
    trailingTitle: String,
    trailingValue: String
  ) -> some View {
    HStack(alignment: .top, spacing: 8) {
      timeMetric
        .frame(maxWidth: .infinity, alignment: .leading)
      metric(title: centerTitle, value: centerValue, alignment: .center)
        .frame(maxWidth: .infinity, alignment: .center)
      metric(title: trailingTitle, value: trailingValue, alignment: .trailing)
        .frame(maxWidth: .infinity, alignment: .trailing)
    }
  }

  private static let metricValueFont = Font.system(size: 27, weight: .heavy, design: .rounded)

  private func metric(title: String, value: String, alignment: HorizontalAlignment) -> some View {
    VStack(alignment: alignment, spacing: 3) {
      Text(value)
        .font(Self.metricValueFont)
        .monospacedDigit()
        .foregroundColor(metricColor)
        .lineLimit(1)
        .minimumScaleFactor(0.5)
      Text(title)
        .font(.caption2)
        .foregroundColor(CardPalette.secondaryText)
    }
  }

  // The 시간 (TIME) metric — same layout as `metric` but the value is the native auto-ticking
  // clock (running) or the static last-pushed elapsed (paused/finished) instead of a plain String.
  private var timeMetric: some View {
    VStack(alignment: .leading, spacing: 3) {
      runTimeText(
        state: state,
        font: Self.metricValueFont
      )
      .foregroundColor(metricColor)
      .lineLimit(1)
      .minimumScaleFactor(0.5)
      Text("시간")
        .font(.caption2)
        .foregroundColor(CardPalette.secondaryText)
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
  // The 30pt header ring has no room for the % label; the label only renders at larger sizes.
  var showsLabel: Bool = false

  var body: some View {
    ZStack {
      Circle().stroke(CardPalette.trackEmpty, lineWidth: 4)
      Circle()
        .trim(from: 0, to: clampProgress(progress))
        .stroke(CardPalette.accent, style: StrokeStyle(lineWidth: 4, lineCap: .round))
        .rotationEffect(.degrees(-90))
      if showsLabel {
        Text("\(Int((clampProgress(progress) * 100).rounded()))%")
          .font(.caption2)
          .fontWeight(.bold)
          .foregroundColor(CardPalette.primaryText)
      }
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
