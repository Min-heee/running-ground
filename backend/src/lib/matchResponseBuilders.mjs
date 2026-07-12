// Facade: the match response builders were decomposed into ./matchResponse/ — this module
// re-exports the same 5 public names so existing importers stay untouched.
export { buildRunningMatchStatusResponse } from './matchResponse/matchStatusResponse.mjs';
export {
  buildDuelMatchResponse,
  buildGroupMatchResponse,
  buildMatchDemandSummaryResponse,
} from './matchResponse/matchmakingResponses.mjs';
export { buildUpcomingRunningMatchesResponse } from './matchResponse/upcomingMatchesResponse.mjs';
