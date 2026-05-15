export type LiveMatchArenaMode = 'duel' | 'group';

export type LiveMatchArenaMountSignal = {
  matchId?: string | null;
  mode: LiveMatchArenaMode;
  source: string;
};

export type LiveMatchArenaMountDetails = {
  deferHeavyContent: boolean;
  participants: number;
};
