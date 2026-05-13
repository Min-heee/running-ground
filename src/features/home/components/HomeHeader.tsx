import { StyleSheet, Text, View } from 'react-native';

export function HomeHeader() {
  return (
    <View style={styles.headerWrap}>
      <Text style={styles.headerLabel}>홈</Text>
      <Text style={styles.headerBrand}>RunningGround</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  headerWrap: {
    gap: 4,
    paddingTop: 4,
  },
  headerLabel: {
    color: '#101828',
    fontSize: 28,
    fontWeight: '800',
  },
  headerBrand: {
    color: '#6D5EF7',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
});
