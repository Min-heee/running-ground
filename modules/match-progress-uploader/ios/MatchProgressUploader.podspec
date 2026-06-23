Pod::Spec.new do |s|
  s.name           = 'MatchProgressUploader'
  s.version        = '1.0.0'
  s.summary        = 'A sample project summary'
  s.description    = 'A sample project description'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  # Must be <= the app's iOS deployment target (Expo SDK 54 default 15.1). A higher floor makes Expo
  # autolinking's `Pod::Platform#supports?` check fail, silently DROPPING this pod from the Pods
  # project so MatchProgressUploaderModule never links on iOS. The Swift uses only iOS 14-era Core
  # Location APIs, so a 15.1 floor links + runs safely.
  s.platforms      = {
    :ios => '15.1',
    :tvos => '15.1'
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
