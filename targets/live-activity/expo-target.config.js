/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = () => ({
  // Widget extensions host both Home Screen widgets AND Live Activities (ActivityKit). The Live
  // Activity is declared as an ActivityConfiguration inside the same WidgetBundle.
  type: 'widget',
  name: 'liveactivity',
  // CFBundleDisplayName for the extension (never user-visible for a Live-Activity-only widget).
  displayName: 'RunningGround Live Activity',
  // Dot-prefixed → appended to the main app bundle id (com.minheee.runnigapp.liveactivity). Keeping
  // it derived means it tracks any future main-app id change automatically.
  bundleIdentifier: '.liveactivity',
  // ActivityKit (Live Activity request/update/end + ContentState) requires iOS 16.2. The widget
  // target is the ONLY target that needs 16.2; the main app stays on its own (lower) target.
  deploymentTarget: '16.2',
  // SwiftUI + WidgetKit render the card; ActivityKit provides ActivityConfiguration / ContentState.
  frameworks: ['SwiftUI', 'WidgetKit', 'ActivityKit'],
  // No entitlements are required for a Live Activity widget extension itself. (Live Activities are
  // gated by the main app's NSSupportsLiveActivities Info.plist key, set via the config plugin in
  // app.config.ts — NOT by an entitlement here. Push-driven updates would need an APNs entitlement,
  // but this card is driven locally via Activity.update(_:), so none is needed.)
});
