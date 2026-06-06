import ExpoModulesCore

public class MatchProgressUploaderModule: Module {
  public func definition() -> ModuleDefinition {
    Name("MatchProgressUploader")
    Function("upload") { (_ url: String, _ authToken: String, _ jsonBody: String) in
      // no-op: iOS keeps using the existing JS fetch path.
    }
  }
}
