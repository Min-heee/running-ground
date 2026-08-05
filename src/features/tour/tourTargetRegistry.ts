// 투어 타깃 등록부: TourTarget 컴포넌트가 마운트 시 자기 측정 함수를 등록하고,
// 오버레이가 스텝마다 measureTourTarget 으로 화면 좌표를 얻는다. RN 무의존 —
// 측정 함수 자체는 TourTarget 이 주입한다.

export type TourRect = { x: number; y: number; width: number; height: number };
export type TourMeasure = () => Promise<TourRect | null>;

const targets = new Map<string, TourMeasure>();

export function registerTourTarget(id: string, measure: TourMeasure): () => void {
  targets.set(id, measure);
  return () => {
    // 같은 id 로 새 인스턴스가 이미 재등록했다면 지우지 않는다 (리마운트 경합).
    if (targets.get(id) === measure) {
      targets.delete(id);
    }
  };
}

export async function measureTourTarget(id: string): Promise<TourRect | null> {
  const measure = targets.get(id);
  if (!measure) {
    return null;
  }
  try {
    const rect = await measure();
    return rect && rect.width > 0 && rect.height > 0 ? rect : null;
  } catch {
    return null;
  }
}
