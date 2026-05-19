import type { FriendRank, FriendRequest, FriendRunRecord } from '@/domain';

export const friendRanks: FriendRank[] = [
  { id: '1', rank: 1, name: '김관우', tag: '#KW8M4', distanceKm: 89, points: 98, isRunningNow: true, liveLocationLabel: '서울숲 근처' },
  { id: '2', rank: 2, name: '민병희', tag: '#BH7K2', distanceKm: 84, points: 91 },
  { id: '3', rank: 3, name: '이서준', tag: '#SJ4Q8', distanceKm: 77, points: 86, isRunningNow: true, liveLocationLabel: '반포한강공원 근처' },
  { id: '4', rank: 4, name: '박지훈', tag: '#JH3N1', distanceKm: 61.2, points: 74 },
  { id: '5', rank: 5, name: '최민준', tag: '#MJ5T2', distanceKm: 58.4, points: 70, isRunningNow: true, liveLocationLabel: '송정동 근처' },
  { id: '6', rank: 6, name: '정이안', tag: '#IA9L3', distanceKm: 46.2, points: 54 },
  { id: '7', rank: 7, name: '이서윤', tag: '#SY1R4', distanceKm: 40.8, points: 48 },
];

export const friendRunRecords: FriendRunRecord[] = [
  { id: 'fr1', date: '2026-03-30', distanceKm: 10.0, pace: '5:12/km' },
  { id: 'fr2', date: '2026-03-28', distanceKm: 12.4, pace: '5:05/km' },
  { id: 'fr3', date: '2026-03-24', distanceKm: 8.6, pace: '5:18/km' },
  { id: 'fr4', date: '2026-03-20', distanceKm: 15.0, pace: '5:27/km' },
  { id: 'fr5', date: '2026-03-16', distanceKm: 9.2, pace: '5:09/km' },
];

export const friendRequests: FriendRequest[] = [
  { id: 'r1', name: '박도윤', tag: '#DY2M8', status: 'pending' },
  { id: 'r2', name: '한예린', tag: '#YR4P6', status: 'received' },
  { id: 'r3', name: '김관우', tag: '#KW8M4', status: 'accepted' },
];
