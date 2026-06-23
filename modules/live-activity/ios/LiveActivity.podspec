Pod::Spec.new do |s|
  s.name           = 'LiveActivity'
  s.version        = '1.0.0'
  s.summary        = 'iOS Live Activity bridge for RunningGround (lock-screen live-run card).'
  s.description    = 'Expo module bridging the run/match runtime to an ActivityKit Live Activity.'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  # Must be <= the app's iOS deployment target (Expo SDK 54 default 15.1). Expo autolinking only
  # integrates a local module pod when `Pod::Platform#supports?` holds, i.e. the pod's minimum iOS
  # is <= the app target's. A higher floor (16.2) silently DROPS this pod from the Pods project, so
  # LiveActivityModule is never compiled/registered and requireNativeModule('LiveActivityModule')
  # throws. ActivityKit (iOS 16.2+) is reached only behind `#available(iOS 16.2, *)` /
  # `#if canImport(ActivityKit)` in the Swift, so a 15.1 floor links safely and no-ops on pre-16.2.
  s.platforms      = {
    :ios => '15.1'
  }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
