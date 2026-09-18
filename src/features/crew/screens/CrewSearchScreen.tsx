import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';

import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { AuthHeader } from '@/components/ui/AuthHeader';
import type { CrewSearchResponse } from '@/lib/api/types/crew';
import { searchCrews } from '@/services';
import { colors } from '@/theme/tokens';
import { crewListStyles as styles } from '../components/crewListStyles';
import {
  CREW_NAME_MAX_LENGTH,
  buildCrewSearchMeta,
  describeCrewSearchResults,
  formatCrewNameWithStars,
  getCrewErrorMessage,
} from '../crewModel';

// 크루 찾기 (오너 2026-09-18: 공개 크루 검색 + 가입 신청). 처음엔 빈 검색어로 이번 시즌 순위 순서를
// 보여주고, 이름을 넣고 검색을 누르면 이름이 들어간 크루(최대 20개). 서버가 사용자당 10분에
// 10번으로 막으므로 글자마다 부르지 않고 제출할 때만 부른다.

type CrewSearchItem = CrewSearchResponse['crews'][number];

function openCrewDetail(crewId: string) {
  router.push({ pathname: '/crew-detail', params: { crewId } });
}

export default function CrewSearchScreen() {
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [results, setResults] = useState<CrewSearchItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 늦게 도착한 옛 검색 응답이 새 결과를 덮지 않게.
  const requestSeqRef = useRef(0);
  // 제출은 마지막 입력값으로 — 글자를 치자마자 검색 키를 누르면 아직 다시 그려지기 전의 낡은
  // query로 검색하는 일이 있다(웹에서 재현). 입력 즉시 ref에도 적어 두고 그걸 읽는다.
  const queryRef = useRef('');

  const runSearch = useCallback(async (nextQuery: string) => {
    const seq = requestSeqRef.current + 1;
    requestSeqRef.current = seq;
    setLoading(true);
    setError(null);

    try {
      const response = await searchCrews(nextQuery);
      if (seq !== requestSeqRef.current) {
        return;
      }
      setResults(response.crews);
      setSubmittedQuery(nextQuery.trim());
    } catch (searchError) {
      if (seq === requestSeqRef.current) {
        setError(getCrewErrorMessage(searchError, '크루를 찾지 못했어요.'));
      }
    } finally {
      if (seq === requestSeqRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void runSearch('');
  }, [runSearch]);

  const handleChangeQuery = useCallback((text: string) => {
    queryRef.current = text;
    setQuery(text);
  }, []);

  const handleSubmit = useCallback(() => {
    void runSearch(queryRef.current);
  }, [runSearch]);

  return (
    <Screen>
      <AuthHeader showBack backHref="/(tabs)/crew" title="크루 찾기" />

      <TextInput
        style={styles.fieldInput}
        value={query}
        onChangeText={handleChangeQuery}
        onSubmitEditing={handleSubmit}
        placeholder="크루 이름으로 찾기"
        placeholderTextColor={colors.textTertiary}
        maxLength={CREW_NAME_MAX_LENGTH + 8}
        returnKeyType="search"
        autoCorrect={false}
        accessibilityLabel="크루 이름 검색"
      />

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {loading && !results ? <ActivityIndicator size="large" color={colors.brand} /> : null}

      {results ? (
        <CrewSearchResults results={results} submittedQuery={submittedQuery} />
      ) : null}
    </Screen>
  );
}

// 안내 한 줄 + 결과 행. 빈 검색어인데 결과가 없으면 크루가 아직 없는 것이라 '이름을 다시 확인'
// 대신 첫 크루를 권한다 (적대 리뷰 2026-09-18: 출시 첫날의 콜드스타트 화면).
function CrewSearchResults({ results, submittedQuery }: { results: CrewSearchItem[]; submittedQuery: string }) {
  const { hint, empty } = describeCrewSearchResults(submittedQuery, results.length);

  return (
    <View style={styles.section}>
      {hint ? <Text style={styles.hintText}>{hint}</Text> : null}
      {results.length > 0 ? (
        <Card style={styles.rowsCard}>
          {results.map((crew, index) => (
            <CrewSearchRow key={crew.id} crew={crew} isFirst={index === 0} />
          ))}
        </Card>
      ) : (
        <Text style={styles.emptyText}>{empty}</Text>
      )}
    </View>
  );
}

const CrewSearchRow = memo(function CrewSearchRow({ crew, isFirst }: { crew: CrewSearchItem; isFirst: boolean }) {
  const handlePress = useCallback(() => openCrewDetail(crew.id), [crew.id]);
  const displayName = formatCrewNameWithStars(crew.name, crew.stars);
  const meta = buildCrewSearchMeta(crew.memberCount, crew.rank);

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`${displayName} ${meta}`}
      style={({ pressed }) => [styles.row, isFirst ? null : styles.rowDivided, pressed ? styles.rowPressed : null]}
    >
      <View style={styles.rowBody}>
        <Text style={styles.name} numberOfLines={1}>{displayName}</Text>
        <Text style={styles.meta} numberOfLines={1}>{meta} · 캡틴 {crew.captainName}</Text>
      </View>
    </Pressable>
  );
});
