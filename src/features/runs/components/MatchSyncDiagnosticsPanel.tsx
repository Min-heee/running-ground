import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { getBackgroundRunTrackingSnapshot } from '@/features/runs/tracking/background';
import { getBackgroundMatchProgressContext } from '@/features/runs/tracking/background/backgroundMatchProgressSync';
import { getBackgroundSyncDiagnostics } from '@/features/runs/tracking/background/backgroundSyncDiagnostics';
import { useMatchSyncDiagnostics } from '@/features/runs/sync/matchSyncDiagnostics';
import { buildMatchProgressRegistryKey } from '@/features/runs/sync/registryKeys';
import { getRgHeartbeatSlotOwnerId } from '@/utils/rgHeartbeatRegistry';

// ON-DEVICE SYNC DIAGNOSTICS PANEL (2026-07-10, temporary) — renders the raw live-match send
// state on screen so a field test can pinpoint EXACTLY where the opponent-sync chain dies
// without guessing from recordings. Reads module stores only (no props), refreshes 1/s.
// Remove once the party-duel opponent-sync freeze is closed.

function ageSeconds(atMs: number | null, nowMs: number): string {
  if (!atMs) {
    return '-';
  }
  return `${Math.max(0, Math.round((nowMs - atMs) / 1000))}s`;
}

function shortId(id: string | null | undefined): string {
  if (!id) {
    return '-';
  }
  return id.length > 10 ? `…${id.slice(-8)}` : id;
}

export function MatchSyncDiagnosticsPanel() {
  const diag = useMatchSyncDiagnostics();
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const ctxMatchId = getBackgroundMatchProgressContext()?.matchId ?? null;
  // Only show while something match-like is going on.
  if (!ctxMatchId && !diag.hbMatchId) {
    return null;
  }

  const snapshot = getBackgroundRunTrackingSnapshot({ cloneRoute: false });
  const bg = getBackgroundSyncDiagnostics();
  const slotKey = buildMatchProgressRegistryKey(ctxMatchId ?? diag.hbMatchId ?? '');
  const slotOwnerId = getRgHeartbeatSlotOwnerId(slotKey);

  const lines = [
    `DIAG v3 ${bg.isAppBackground ? 'BG' : 'FG'} snap:${snapshot.status} ${typeof snapshot.distanceKm === 'number' ? snapshot.distanceKm.toFixed(2) : '-'}km`,
    `ctx:${shortId(ctxMatchId)} hb:${diag.hbEnabled ? 'ON' : 'OFF'} ${shortId(diag.hbMatchId)}`,
    `slot:${slotOwnerId ?? '-'} mine:${diag.myHeartbeatOwnerId ?? '-'} canSend:${diag.lastCanSend === null ? '-' : diag.lastCanSend ? 'Y' : 'N'}(${ageSeconds(diag.lastCanSendAtMs, nowMs)})`,
    `push a:${diag.pushAttempts} ok:${diag.pushOks}(${ageSeconds(diag.lastPushOkAtMs, nowMs)}) err:${diag.pushErrs}${diag.lastPushErr ? ` ${diag.lastPushErr.slice(0, 22)}` : ''}`,
    `LL t:${diag.lifelineTicks} fire:${diag.lifelineFires}(${ageSeconds(diag.lastLifelineFireAtMs, nowMs)}) skip:${diag.lastLifelineSkip ?? '-'}`,
    `bgHb:${bg.heartbeatAttemptCount}(${ageSeconds(bg.lastHeartbeatAtMs, nowMs)})`,
  ];

  return (
    <View pointerEvents="none" style={styles.container}>
      {lines.map((line) => (
        <Text key={line} style={styles.line} numberOfLines={1}>
          {line}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    zIndex: 60,
  },
  line: {
    color: '#7CFC9A',
    fontSize: 10,
    fontVariant: ['tabular-nums'],
    fontFamily: undefined,
  },
});
