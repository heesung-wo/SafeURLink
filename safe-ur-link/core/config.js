// 개발자가 확장 프로그램 배포 전에 한 번만 변경할 주소
// 사용자는 API 키나 URL을 입력할 필요 X
export const SIGNATURE_FEED_URL = 'https://heesung-wo.github.io/SafeURLink/signatures.json';

// 실제 원본 API 조회(비밀 키 사용)는 GitHub Actions에서만 수행.
// 확장 프로그램의 확인 시각(매일 15:00 KST)은 core/daily-sync.js에서 관리.
