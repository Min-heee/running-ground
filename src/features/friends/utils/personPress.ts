import { Alert } from 'react-native';
import { router } from 'expo-router';
import { fetchFriendRelation, sendFriendRequestToUser } from '@/services';
import { getApiErrorMessage } from '@/services/apiError';

// 랭킹 보드(지역 멤버·오늘·랭크)에서 사람을 눌렀을 때의 공용 분기 (오너 스펙
// 2026-07-27): 친구만 프로필을 볼 수 있다 —
//   나 → 내 활동, 친구 → 프로필, 무관계 → 친구 신청 다이얼로그(네/아니요),
//   보낸 신청 대기 → 안내, 받은 신청 대기 → 친구 탭 수락 안내.
// 서버도 활동 조회를 친구로 잠그고 있어(403) 이 분기는 UX용, 보안은 서버 몫.
export async function handleRankedPersonPress({ userId, name }: { userId: string; name: string }) {
  if (!userId) {
    return;
  }

  let relation: Awaited<ReturnType<typeof fetchFriendRelation>>;

  try {
    relation = await fetchFriendRelation(userId);
  } catch (relationError) {
    Alert.alert('프로필', getApiErrorMessage(relationError, '사용자 정보를 불러오지 못했어요.'));
    return;
  }

  switch (relation.relation) {
    case 'self':
      router.push('/(tabs)/records');
      return;
    case 'friend':
      router.push({ pathname: '/friend-detail', params: { friendId: userId } });
      return;
    case 'outgoing':
      Alert.alert('친구 신청 대기 중', `${name}님의 수락을 기다리고 있어요. 수락하면 프로필을 볼 수 있어요.`);
      return;
    case 'incoming':
      Alert.alert(
        '친구 신청 도착',
        `${name}님이 이미 친구 신청을 보냈어요. 친구 탭에서 수락하면 프로필을 볼 수 있어요.`,
      );
      return;
    default:
      Alert.alert(
        '친구 신청',
        `상대방 프로필은 친구 추가가 되어 있어야 볼 수 있어요.\n${name}님에게 친구 신청을 보낼까요?`,
        [
        { text: '아니요', style: 'cancel' },
        {
          text: '네',
          onPress: () => {
            sendFriendRequestToUser(userId)
              .then(() => {
                Alert.alert('친구 신청 완료', `${name}님에게 친구 신청을 보냈어요. 수락하면 프로필을 볼 수 있어요.`);
              })
              .catch((requestError) => {
                Alert.alert('친구 신청 실패', getApiErrorMessage(requestError, '친구 신청을 보내지 못했어요.'));
              });
          },
        },
      ]);
  }
}
