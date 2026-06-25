// Legal document URLs surfaced in-app. App Store Review Guideline 5.1.1(i) and Play
// Console Data Safety both expect an IN-APP privacy-policy link for apps that collect
// personal data — RunningGround collects location, health (Apple Health / Health Connect),
// and account data, so this link must resolve before a production submission.
//
// ⚠️ BEFORE the production native build / store submission:
//   1. Host docs/privacy-policy.html at PRIVACY_POLICY_URL (the team owns running-ground.com).
//   2. Enter the same URL in App Store Connect + Play Console listing forms.
//   3. If a 이용약관(Terms of Service) is required, host it and set TERMS_OF_SERVICE_URL;
//      leave it null to hide that row.
export const PRIVACY_POLICY_URL = 'https://running-ground.com/privacy-policy';

// Set to a hosted 이용약관 URL once written; null hides the Terms row.
export const TERMS_OF_SERVICE_URL: string | null = null;
