# 문서

이 폴더는 앱을 만들면서 남긴 설계 · 진단 · 감사 기록의 **원본**입니다. 정리해서 다시 쓴 문서가 아니라 그때그때 판단을 적어 둔 것이라 파일이 많습니다. 처음 보신다면 아래 순서를 권합니다.

## 먼저 읽을 것

1. **[PRD.md](PRD.md)** — 이 프로젝트의 PRD. 경쟁 판정의 공정성(문제 · 요구사항 · 판정 상수 · 설계 결정 · AI 사용 방식)
2. **[architecture.md](architecture.md)** — 시스템 구조도, 실시간 매치 시퀀스, 카운트다운 동기화, 백그라운드 위치 추적
3. **[case-studies/](case-studies/)** — 엔지니어링 사례연구 4편. 네 편 모두 *처음 의심한 것과 그게 왜 틀렸는지*를 먼저 씁니다
   - [opponent-distance-freeze.md](case-studies/opponent-distance-freeze.md) — 상대방 거리가 0.00km로 얼어붙던 문제
   - [store-blob-gps-routes.md](case-studies/store-blob-gps-routes.md) — 진행률 전송이 타임아웃되던 진짜 이유
   - [screen-off-record-loss.md](case-studies/screen-off-record-loss.md) — 화면을 끄면 기록이 사라지던 문제
   - [cross-device-distance-parity.md](case-studies/cross-device-distance-parity.md) — 두 폰이 같은 코스를 뛰었는데 거리가 다르던 문제
4. **[DEVELOPMENT.md](DEVELOPMENT.md)** — 로컬 실행 환경(원래 저장소 루트에 있던 README)
5. **[BACKLOG.md](BACKLOG.md)** — 남은 일

## 나머지는 어떤 것들인가

| 묶음 | 대표 문서 |
| --- | --- |
| 아키텍처 · 데이터 계층 | [app-architecture.md](app-architecture.md) · [server-backend-architecture.md](server-backend-architecture.md) · [backend-api-contract.md](backend-api-contract.md) · [frontend-data-layer.md](frontend-data-layer.md) |
| 공정성 · 판정 설계 | [fair-verdict-design-2026-07-05.md](fair-verdict-design-2026-07-05.md) · [metric-parity-design-2026-07-05.md](metric-parity-design-2026-07-05.md) · [checkpoint-fairness-plan-2026-07-09.md](checkpoint-fairness-plan-2026-07-09.md) |
| 실시간 매치 동기화 | [live-match-core-rewrite.md](live-match-core-rewrite.md) · [live-match-progress-sync.md](live-match-progress-sync.md) · [live-match-update-cadence.md](live-match-update-cadence.md) |
| 진단 기록(사례연구의 원자료) | `*-diag-*.md` — [heartbeat-slot-latch-diag-2026-07-07.md](heartbeat-slot-latch-diag-2026-07-07.md) 등. 사례연구 4편은 이 기록들을 정리한 것입니다 |
| 성능 | [perf/](perf/) · [android-live-match-performance-budget.md](android-live-match-performance-budget.md) · [ios-perf-audit-2026-07-05.md](ios-perf-audit-2026-07-05.md) |
| 코드 품질 감사 | [full-codebase-quality-audit.md](full-codebase-quality-audit.md) · [code-quality-gate.md](code-quality-gate.md) · [code-size-audit.md](code-size-audit.md) |
| 출시 · 운영 런북 | [release-runbook.md](release-runbook.md) · [digitalocean-cloudflare-caddy-runbook.md](digitalocean-cloudflare-caddy-runbook.md) · [backup-restore-runbook.md](backup-restore-runbook.md) · [platform-release-strategy.md](platform-release-strategy.md) |
| 실기기 QA | [qa-sessions/](qa-sessions/) · [match-real-device-qa.md](match-real-device-qa.md) · [device-integration-qa-matrix.md](device-integration-qa-matrix.md) |
| 인수인계 메모 | [handoff/](handoff/) |

파일명의 날짜는 그 문서를 쓴 날입니다. 이후에 판단이 바뀐 것도 고치지 않고 그대로 뒀습니다 — 무엇을 언제 틀렸는지가 이 폴더의 내용이기 때문입니다.
