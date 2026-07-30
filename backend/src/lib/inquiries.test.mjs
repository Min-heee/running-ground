import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildAdminInquiriesPayload,
  buildMyInquiriesPayload,
  createUserInquiry,
  removeUserInquiries,
  replyToInquiry,
} from './inquiries.mjs';

const NOW = new Date('2026-07-31T02:00:00.000Z');

function buildStore() {
  return {
    users: [
      { id: 'user-a', name: '회원G', publicTag: '#MBG01' },
      { id: 'user-b', name: '다른사람', publicTag: '#OTH01' },
    ],
    inquiries: [],
    notifications: [],
  };
}

test('문의 작성 → 내 내역에 대기 상태로 보인다', () => {
  const store = buildStore();
  const created = createUserInquiry(store, { id: 'user-a' }, { title: '기록이 안 올라와요', body: '나이키 기록이요' }, NOW);

  assert.equal(created.inquiry.status, 'pending');
  assert.equal(created.inquiry.title, '기록이 안 올라와요');

  const mine = buildMyInquiriesPayload(store, { id: 'user-a' });
  assert.equal(mine.inquiries.length, 1);
  assert.equal(mine.inquiries[0].replies.length, 0);

  // 남의 문의는 안 보인다.
  assert.equal(buildMyInquiriesPayload(store, { id: 'user-b' }).inquiries.length, 0);
});

test('빈 제목/내용과 길이 초과는 거부', () => {
  const store = buildStore();

  assert.throws(() => createUserInquiry(store, { id: 'user-a' }, { title: '  ', body: '내용' }, NOW), /제목/);
  assert.throws(() => createUserInquiry(store, { id: 'user-a' }, { title: '제목', body: '' }, NOW), /내용/);
  assert.throws(
    () => createUserInquiry(store, { id: 'user-a' }, { title: 'ㄱ'.repeat(61), body: '내용' }, NOW),
    /60자/,
  );
  assert.equal(store.inquiries.length, 0);
});

test('하루 10건 상한', () => {
  const store = buildStore();

  for (let index = 0; index < 10; index += 1) {
    createUserInquiry(store, { id: 'user-a' }, { title: `문의 ${index}`, body: '내용' }, NOW);
  }

  assert.throws(
    () => createUserInquiry(store, { id: 'user-a' }, { title: '초과', body: '내용' }, NOW),
    /하루에 보낼 수 있는/,
  );
  // 다른 유저는 영향 없음.
  createUserInquiry(store, { id: 'user-b' }, { title: '나도 문의', body: '내용' }, NOW);
  assert.equal(store.inquiries.length, 11);
});

test('관리자 답변 → 상태 answered + 유저 인박스 알림', () => {
  const store = buildStore();
  const created = createUserInquiry(store, { id: 'user-a' }, { title: '기록 문의', body: '내용' }, NOW);
  const replied = replyToInquiry(store, created.inquiry.id, { body: '확인했어요, 곧 반영됩니다.' }, NOW);

  assert.equal(replied.inquiry.status, 'answered');
  assert.equal(replied.inquiry.replies[0].body, '확인했어요, 곧 반영됩니다.');
  assert.equal(replied.inquiry.userName, '회원G');

  const notification = store.notifications.find((entry) => entry.userId === 'user-a');
  assert.equal(notification.type, 'inquiry_reply');
  assert.ok(notification.body.includes('확인했어요'));
  assert.equal(notification.data.inquiryId, created.inquiry.id);

  // 유저 내역에도 답변이 실린다.
  const mine = buildMyInquiriesPayload(store, { id: 'user-a' });
  assert.equal(mine.inquiries[0].status, 'answered');
  assert.equal(mine.inquiries[0].replies.length, 1);
});

test('관리자 목록: 답변 대기 먼저, 사용자 이름 포함, 없는 문의 답변은 404', () => {
  const store = buildStore();
  const first = createUserInquiry(store, { id: 'user-a' }, { title: '먼저', body: '내용' }, NOW);
  createUserInquiry(store, { id: 'user-b' }, { title: '나중', body: '내용' }, new Date(NOW.getTime() + 1000));
  replyToInquiry(store, first.inquiry.id, { body: '답변' }, NOW);

  const admin = buildAdminInquiriesPayload(store);
  assert.equal(admin.pendingCount, 1);
  assert.equal(admin.inquiries[0].title, '나중'); // 대기 중이 위로
  assert.equal(admin.inquiries[0].userName, '다른사람');
  assert.equal(admin.inquiries[1].status, 'answered');

  assert.throws(() => replyToInquiry(store, 'inquiry-없음', { body: '답변' }, NOW), /찾을 수 없어요/);
  assert.throws(() => replyToInquiry(store, first.inquiry.id, { body: '  ' }, NOW), /답변 내용/);
});

test('보존 정책: 답변 완료 90일 경과분과 유저당 20건 초과분은 정리, 미답변은 유지', () => {
  const store = buildStore();
  const old = new Date(NOW.getTime() - 100 * 24 * 60 * 60 * 1_000);

  // 오래된 답변 완료 1건 + 오래된 미답변 1건.
  const answeredOld = createUserInquiry(store, { id: 'user-a' }, { title: '오래된 답변', body: '내용' }, old);
  replyToInquiry(store, answeredOld.inquiry.id, { body: '답변' }, old);
  createUserInquiry(store, { id: 'user-a' }, { title: '오래된 미답변', body: '내용' }, old);

  // 새 문의 작성 시 프루닝이 돈다.
  createUserInquiry(store, { id: 'user-a' }, { title: '새 문의', body: '내용' }, NOW);

  const titles = store.inquiries.map((entry) => entry.title);
  assert.ok(!titles.includes('오래된 답변'), '답변 완료 90일 경과분은 정리된다');
  assert.ok(titles.includes('오래된 미답변'), '미답변은 오래돼도 남는다');
  assert.ok(titles.includes('새 문의'));
});

test('탈퇴 정리: 그 유저의 문의만 사라진다', () => {
  const store = buildStore();
  createUserInquiry(store, { id: 'user-a' }, { title: 'A 문의', body: '내용' }, NOW);
  createUserInquiry(store, { id: 'user-b' }, { title: 'B 문의', body: '내용' }, NOW);

  removeUserInquiries(store, 'user-a');

  assert.deepEqual(store.inquiries.map((entry) => entry.title), ['B 문의']);
});
