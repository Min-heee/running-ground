import { registerWebModule, NativeModule } from 'expo';

// MatchProgressUploaderModule is not available on the web platform.
class MatchProgressUploaderModule extends NativeModule<Record<string, never>> {}

export default registerWebModule(MatchProgressUploaderModule, 'MatchProgressUploaderModule');
