import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// The duel/group reservation rooms previously shipped their own (byte-identical)
// poll-cadence constants; after the dedupe they share the SINGLE definition in
// useReservationRoomCore. These pins are source-level because the hooks' import
// graph reaches react-native, which node:test cannot load: they assert the shipped
// cadence values are unchanged and that neither wrapper re-forks its own constants,
// so both rooms always poll (and therefore reach clockReady) on the same schedule.

const hooksDir = join(process.cwd(), 'src/features/match/hooks');
const coreSource = readFileSync(join(hooksDir, 'useReservationRoomCore.ts'), 'utf8');
const duelSource = readFileSync(join(hooksDir, 'useDuelReservationRoom.ts'), 'utf8');
const groupSource = readFileSync(join(hooksDir, 'useGroupReservationRoom.ts'), 'utf8');

function readCadenceConstant(source: string, name: string): number | null {
  const match = source.match(new RegExp(`export const ${name} = ([\\d_]+);`));
  return match ? Number(match[1].replace(/_/g, '')) : null;
}

test('the core ships the exact poll cadence both rooms had before the dedupe', () => {
  assert.equal(readCadenceConstant(coreSource, 'RESERVATION_STATUS_POLL_INTERVAL_MS'), 15_000);
  assert.equal(readCadenceConstant(coreSource, 'RESERVATION_STATUS_FAST_POLL_INTERVAL_MS'), 1_000);
  assert.equal(readCadenceConstant(coreSource, 'RESERVATION_STATUS_FAST_POLL_WITHIN_SECONDS'), 60);
});

test('both reservation-room wrappers share the single core cadence (no re-forked constants)', () => {
  const wrappers = [
    ['useDuelReservationRoom', duelSource],
    ['useGroupReservationRoom', groupSource],
  ] as const;

  for (const [name, source] of wrappers) {
    // The wrapper delegates to the shared core...
    assert.match(source, /useReservationRoomCore\(/, `${name} must call useReservationRoomCore`);
    // ...re-exports the shared cadence constants from the core...
    assert.match(
      source,
      /RESERVATION_STATUS_POLL_INTERVAL_MS[\s\S]*?\} from '@\/features\/match\/hooks\/useReservationRoomCore'/,
      `${name} must re-export the core poll-cadence constants`,
    );
    // ...and defines no local cadence constants of its own.
    assert.doesNotMatch(
      source,
      /const RESERVATION_STATUS/,
      `${name} must not define its own poll cadence`,
    );
  }
});
