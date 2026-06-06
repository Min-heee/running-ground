import { NativeModule, requireNativeModule } from 'expo';

declare class MatchProgressUploaderModule extends NativeModule<Record<string, never>> {}

export default requireNativeModule<MatchProgressUploaderModule>('MatchProgressUploader');
