import SwiftUI
import WidgetKit

// Entry point for the widget extension. A widget extension must declare exactly one @main
// WidgetBundle. This bundle ships ONLY the Live Activity (RunLiveActivityWidget) — there is no
// Home Screen widget.
//
// The target's deploymentTarget is 16.2 (set in expo-target.config.js), which is exactly what
// ActivityKit's ActivityConfiguration requires, so the whole bundle is marked @available(iOS 16.2)
// and includes the widget unconditionally. Because the minimum deployment target equals the
// availability floor, @main on the annotated type is valid.
@available(iOS 16.2, *)
@main
struct RunningGroundWidgets: WidgetBundle {
  var body: some Widget {
    RunLiveActivityWidget()
  }
}
