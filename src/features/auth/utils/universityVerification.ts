export type VerificationMethodId = 'certificate' | 'everytime';

export type VerificationMethod = {
  id: VerificationMethodId;
  title: string;
  summary: string;
  steps: string[];
  checklist: string[];
};

export const VERIFICATION_METHODS: VerificationMethod[] = [
  {
    id: 'certificate',
    title: '재학증명서 인증',
    summary: '학교가 발급한 재학증명서를 올려서 인증하는 방식이에요. 출시 초기에 가장 안정적으로 붙이기 좋은 경로예요.',
    steps: [
      '학교 포털이나 증명서 발급 서비스에서 최신 재학증명서를 준비해요.',
      '학교명과 함께 파일을 올리면 운영 검토 후 인증을 반영해요.',
      '인증이 끝나면 대학 리그와 프로필에 자동으로 연결돼요.',
    ],
    checklist: [
      '최근 발급한 재학증명서 준비',
      '학교명 확인',
      '가려야 하는 개인정보 범위 확인',
    ],
  },
  {
    id: 'everytime',
    title: '에브리타임 방식 인증',
    summary: '에브리타임처럼 학교 이메일이나 학교 인증 완료 상태를 확인하는 간편 인증 방식도 같이 준비할 예정이에요.',
    steps: [
      '지원 학교와 인증 조건이 정리되면 학교 이메일 또는 서비스 인증으로 진행해요.',
      '인증이 끝나면 대학명이 프로필과 대학 리그에 안전하게 반영돼요.',
      '인증 전까지는 임의 입력 없이 비인증 상태를 유지해요.',
    ],
    checklist: [
      '학교 이메일 확인',
      '지원 학교 여부 확인',
      '서비스 연동 또는 확인 코드 입력 준비',
    ],
  },
];

export function filterUniversitySuggestions(universities: string[], queryValue: string) {
  const query = queryValue.trim();

  if (!query) {
    return universities.slice(0, 8);
  }

  return universities
    .filter((university) => university.includes(query))
    .slice(0, 8);
}
