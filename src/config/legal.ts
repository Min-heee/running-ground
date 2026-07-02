// Legal document URLs surfaced in-app. App Store Review Guideline 5.1.1(i) and Play
// Console Data Safety both expect an IN-APP privacy-policy link for apps that collect
// personal data — RunningGround collects location, health (Apple Health / Health Connect),
// and account data, so this link must resolve before a production submission.
//
// HOSTED: the production backend itself serves the policy (backend/src/routes/
// legalRoutes.mjs) on the already-live api subdomain — both /privacy and
// /privacy-policy respond, so no apex-domain DNS is needed. Enter this same URL in the
// App Store Connect + Play Console listing forms. If a 이용약관(Terms of Service) is
// required, host it the same way and set TERMS_OF_SERVICE_URL; null hides that row.
export const PRIVACY_POLICY_URL = 'https://api.running-ground.com/privacy-policy';

// Set to a hosted 이용약관 URL once written; null hides the Terms row.
export const TERMS_OF_SERVICE_URL: string | null = null;
