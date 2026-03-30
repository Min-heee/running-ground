import { StyleSheet, Text } from 'react-native';
import { Screen } from '@/components/Screen';
import { FriendsRanking } from '@/features/friends/FriendsRanking';
import { friendRanks } from '@/data/mock';

export default function FriendsScreen() {
  return (
    <Screen>
      <Text style={styles.title}>친구 랭킹</Text>
      <FriendsRanking ranks={friendRanks} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 28, fontWeight: '800', color: '#101828' },
});
