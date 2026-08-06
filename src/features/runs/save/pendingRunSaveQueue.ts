// 저장 대기열 (오너 2026-08-06, 회원K 파티런 기록 실종 사고): 러닝 저장 요청을
// 보내기 전에 정확한 저장 페이로드를 디스크에 먼저 써두고, 성공하면 지우고, 실패하면
// 다음 앱 실행/포그라운드 복귀 때 자동 재전송한다. 화면 꺼짐 절전에서 막 깬 갤럭시의
// 첫 요청이 죽어도 기록이 영구 유실되지 않는다.
//
// 안전 계약 (적대 리뷰 2026-08-06 반영):
// - 서버는 같은 (userId, startedAt) 재전송을 중복이 아니라 기존 행 반환/업그레이드로
//   처리한다 — "성공했는데 응답만 유실" 재전송도 이중 기록이 안 된다.
// - 소유자 대조는 양성 일치일 때만 전송(fail-closed): 불변 id가 양쪽에 있으면 id로
//   (다르면 진짜 다른 계정 → 폐기), 없으면 태그로 — 태그 불일치는 본인 개명일 수
//   있어 폐기하지 않고 보류(7일 만료가 정리). 식별 불가면 보류.
// - 쓰기는 tmp 파일 → 원자적 이동 — 크래시로 잘린 파일이 최종 이름을 차지하지 않는다.
// - 로그아웃/회원탈퇴 시 전부 삭제, 기록 버리기(discard) 시 그 러닝의 파일 삭제.
// - 모든 함수는 best-effort: 대기열 실패가 저장 흐름을 깨면 안 된다.

import * as FileSystem from 'expo-file-system/legacy';

import { createTrackedRun } from '@/lib/api/services/runs';
import type { CreateTrackedRunInput } from '@/lib/api/types/runs';
import { getCurrentUserProfile } from '@/lib/session';

const STORAGE_DIR_NAME = 'rg-pending-run-saves';
const PENDING_SAVE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const PENDING_SAVE_VERSION = 1;
const PENDING_FILE_PATTERN = /^save-.*\.json$/;

type PendingRunSaveFile = {
  version: 1;
  savedAt: number;
  // 소유자 식별 — ownerId는 서버 불변 userId(프로필 페이로드의 id), ownerTag는 가변
  // 러닝태그(구서버 폴백). 드레인의 양성 일치 판정에 쓴다.
  ownerId: string | null;
  ownerTag: string | null;
  input: CreateTrackedRunInput;
};

function getStorageDirectory(): string | null {
  if (!FileSystem.documentDirectory) {
    return null;
  }
  return `${FileSystem.documentDirectory}${STORAGE_DIR_NAME}/`;
}

async function ensureStorageDirectory(): Promise<string | null> {
  const directory = getStorageDirectory();
  if (!directory) {
    return null;
  }
  const info = await FileSystem.getInfoAsync(directory);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  }
  return directory;
}

// 파일명은 startedAt 기반 — 같은 러닝의 재영속이 자연히 같은 파일을 덮고, 기록
// 버리기가 startedAt만으로 그 러닝의 파일을 지울 수 있다.
function buildFileName(startedAt: string | null | undefined): string {
  const stamp = String(startedAt ?? '').replace(/[^0-9TZ]/g, '');
  return `save-${stamp || Date.now()}.json`;
}

// 저장 요청 직전에 호출 — 성공 시 clearPendingRunSave 로 지울 수 있게 URI 를 돌려준다.
export async function persistPendingRunSave(input: CreateTrackedRunInput): Promise<string | null> {
  try {
    const directory = await ensureStorageDirectory();
    if (!directory) {
      return null;
    }
    const profile = getCurrentUserProfile();
    const payload: PendingRunSaveFile = {
      version: PENDING_SAVE_VERSION,
      savedAt: Date.now(),
      ownerId: profile?.id ?? null,
      ownerTag: profile?.publicTag ?? null,
      input,
    };

    // 원자적 쓰기: tmp에 완성한 뒤 최종 이름으로 이동 — 도중 크래시는 tmp 잔재만 남기고,
    // 드레인의 이름 필터가 tmp를 정리한다.
    const uri = `${directory}${buildFileName(input.startedAt)}`;
    const tmpUri = `${directory}tmp-${Date.now()}.json`;
    await FileSystem.writeAsStringAsync(tmpUri, JSON.stringify(payload));
    await FileSystem.deleteAsync(uri, { idempotent: true });
    await FileSystem.moveAsync({ from: tmpUri, to: uri });
    return uri;
  } catch {
    return null;
  }
}

export async function clearPendingRunSave(uri: string | null): Promise<void> {
  if (!uri) {
    return;
  }
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch {
    // 다음 드레인의 서버 dedupe/만료가 정리한다.
  }
}

// 기록 버리기(discard) 경로용 — 버린 러닝의 대기 파일이 다음 드레인에서 되살아나면
// 안 된다.
export async function clearPendingRunSaveForStartedAt(startedAt: string | null | undefined): Promise<void> {
  if (!startedAt) {
    return;
  }
  const directory = getStorageDirectory();
  if (!directory) {
    return;
  }
  try {
    await FileSystem.deleteAsync(`${directory}${buildFileName(startedAt)}`, { idempotent: true });
  } catch {
    // best-effort.
  }
}

export async function clearAllPendingRunSaves(): Promise<void> {
  const directory = getStorageDirectory();
  if (!directory) {
    return;
  }
  try {
    await FileSystem.deleteAsync(directory, { idempotent: true });
  } catch {
    // best-effort.
  }
}

function parsePendingFile(raw: string): PendingRunSaveFile | null {
  try {
    const parsed = JSON.parse(raw) as Partial<PendingRunSaveFile>;
    if (!parsed || parsed.version !== PENDING_SAVE_VERSION) {
      return null;
    }
    const input = parsed.input;
    if (!input || typeof input !== 'object'
      || typeof input.startedAt !== 'string'
      || typeof input.date !== 'string'
      || typeof input.distanceKm !== 'number') {
      return null;
    }
    return {
      version: PENDING_SAVE_VERSION,
      savedAt: typeof parsed.savedAt === 'number' ? parsed.savedAt : 0,
      ownerId: typeof parsed.ownerId === 'string' ? parsed.ownerId : null,
      ownerTag: typeof parsed.ownerTag === 'string' ? parsed.ownerTag : null,
      input: input as CreateTrackedRunInput,
    };
  } catch {
    return null;
  }
}

// 양성 일치일 때만 'send'. 'discard' = 진짜 다른 계정(불변 id 불일치), 'hold' = 판정
// 불가·개명 가능성 — 보내지도 지우지도 않는다 (7일 만료가 정리).
function resolveOwnerAction(pending: PendingRunSaveFile): 'send' | 'hold' | 'discard' {
  const profile = getCurrentUserProfile();
  const currentId = profile?.id ?? null;
  const currentTag = profile?.publicTag ?? null;

  if (pending.ownerId && currentId) {
    return pending.ownerId === currentId ? 'send' : 'discard';
  }
  if (pending.ownerTag && currentTag) {
    // 태그는 개명 가능(프로필 편집) — 불일치를 폐기 근거로 쓰면 본인 기록을 지운다.
    return pending.ownerTag === currentTag ? 'send' : 'hold';
  }
  return 'hold';
}

let drainInFlight = false;
let lastDrainAtMs = 0;
const DRAIN_MIN_INTERVAL_MS = 30 * 1000;

export type DrainResult = { attempted: number; saved: number; expired: number };

// 앱 실행/포그라운드 복귀 때 호출 — 남은 저장을 오래된 것부터 재전송한다.
// 성공(또는 서버 중복 처리 성공)하면 삭제, 실패하면 다음 기회로, 7일 지나면 폐기.
export async function drainPendingRunSaves(nowMs: number = Date.now()): Promise<DrainResult> {
  const result: DrainResult = { attempted: 0, saved: 0, expired: 0 };

  if (drainInFlight || nowMs - lastDrainAtMs < DRAIN_MIN_INTERVAL_MS) {
    return result;
  }
  drainInFlight = true;
  lastDrainAtMs = nowMs;

  try {
    const directory = getStorageDirectory();
    if (!directory) {
      return result;
    }
    const info = await FileSystem.getInfoAsync(directory);
    if (!info.exists) {
      return result;
    }

    const names = (await FileSystem.readDirectoryAsync(directory)).sort();
    for (const name of names) {
      const uri = `${directory}${name}`;
      try {
        // 정식 이름이 아닌 파일(잘린 tmp 잔재 등)은 정리만 한다.
        if (!PENDING_FILE_PATTERN.test(name)) {
          await FileSystem.deleteAsync(uri, { idempotent: true });
          continue;
        }

        const pending = parsePendingFile(await FileSystem.readAsStringAsync(uri));
        if (!pending) {
          await FileSystem.deleteAsync(uri, { idempotent: true });
          continue;
        }
        if (nowMs - pending.savedAt > PENDING_SAVE_MAX_AGE_MS) {
          await FileSystem.deleteAsync(uri, { idempotent: true });
          result.expired += 1;
          continue;
        }

        const ownerAction = resolveOwnerAction(pending);
        if (ownerAction === 'discard') {
          await FileSystem.deleteAsync(uri, { idempotent: true });
          continue;
        }
        if (ownerAction === 'hold') {
          continue;
        }

        result.attempted += 1;
        await createTrackedRun(pending.input);
        await FileSystem.deleteAsync(uri, { idempotent: true });
        result.saved += 1;
      } catch {
        // 이 파일은 이번엔 실패 — 남겨두고 다음 파일로. (재전송 자체가 실패해도
        // 서버 dedupe 덕에 다음 시도가 안전하다.)
      }
    }
    return result;
  } finally {
    drainInFlight = false;
  }
}

// 테스트용 — 드레인 스로틀 초기화.
export function resetPendingRunSaveDrainThrottleForTest() {
  drainInFlight = false;
  lastDrainAtMs = 0;
}
