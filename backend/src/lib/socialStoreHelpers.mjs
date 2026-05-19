import { ApiError } from '../response/httpResponse.mjs';
import { findUserById } from './userStoreHelpers.mjs';

export function getFriendIds(store, userId) {
  return store.friendships.flatMap((friendship) => {
    if (friendship.userIds[0] === userId) {
      return [friendship.userIds[1]];
    }

    if (friendship.userIds[1] === userId) {
      return [friendship.userIds[0]];
    }

    return [];
  });
}

export function areFriends(store, leftUserId, rightUserId) {
  return store.friendships.some((entry) => (
    entry.userIds.includes(leftUserId) && entry.userIds.includes(rightUserId)
  ));
}

export function requireFriendAccess(store, currentUserId, friendId) {
  if (currentUserId === friendId || areFriends(store, currentUserId, friendId)) {
    return;
  }

  throw new ApiError(403, '친구로 연결된 사용자 기록만 볼 수 있어.');
}

export function getActionableRequests(store, currentUserId) {
  return store.friendRequests
    .filter((request) => request.status === 'pending')
    .filter((request) => request.requesterId === currentUserId || request.receiverId === currentUserId)
    .map((request) => {
      const otherUserId = request.requesterId === currentUserId ? request.receiverId : request.requesterId;
      const otherUser = findUserById(store, otherUserId);

      return {
        id: request.id,
        name: otherUser.name,
        tag: otherUser.publicTag,
        status: request.requesterId === currentUserId ? 'pending' : 'received',
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name, 'ko'));
}
