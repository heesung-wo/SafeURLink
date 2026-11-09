// 개발자가 확장 프로그램 배포 전에 한 번만 변경할 주소입니다.
// 사용자는 API 키나 URL을 입력할 필요가 없습니다.
// GitHub 저장소: https://github.com/heesung-wo/SafeURLink
// GitHub Pages 프로젝트 피드: https://heesung-wo.github.io/SafeURLink/signatures.json
// .git 저장소 주소가 아니라 GitHub Pages에 게시된 JSON 파일을 내려받습니다.
export const SIGNATURE_FEED_URL = 'https://heesung-wo.github.io/SafeURLink/signatures.json';

// 실제 원본 API 조회(비밀 키 사용)는 GitHub Actions에서만 수행합니다.
// 확장 프로그램의 확인 시각(매일 15:00 KST)은 core/daily-sync.js에서 관리합니다.
