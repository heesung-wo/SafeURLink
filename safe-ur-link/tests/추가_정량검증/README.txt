SafeURLink 추가 정량 검증 - 실행 및 결과 안내

0. 검증 목적과 안전 원칙
- 확장 프로그램에 등록된 활성 시그니처 조회, 정상 URL 후보 오경고, 설치된 DNR 규칙 일치 여부를 확인합니다.
- 악성 URL에 직접 접속하지 않습니다. 기존 background의 check 메시지, IndexedDB 및 DNR 가상 요청만 사용합니다.
- 이 도구는 졸업작품의 검증용 내부 페이지이며 실제 사용자의 필수 기능이 아닙니다.
- 실행 전에 SafeURLink가 설치되어 있고 시그니처 및 실시간 보호 규칙이 준비되어 있는지 확인하세요.
- 현재 DB와 사용자 설정은 변경하지 않습니다. 실제 악성 URL이 포함된 개별 결과 CSV는 공개하지 마세요.

1. 도구 위치 및 브라우저에서 열기
- 이 도구는 이미 safe-ur-link/tests/추가_정량검증/ 안에 포함되어 있습니다. 별도 복사는 필요하지 않습니다.
- ZIP을 풀고 Whale/Chrome 확장 프로그램 관리 화면에서 safe-ur-link/ 폴더를 '압축 해제된 확장 프로그램 로드'로 설치합니다.
- 이미 설치되어 있다면 확장 프로그램을 삭제하지 말고 동일 폴더에서 새로고침하세요.
- 확장 프로그램 관리 화면에서 SafeURLink의 ID를 확인합니다.
- Chrome: chrome-extension://<확장프로그램ID>/tests/추가_정량검증/evaluation.html
- Whale: whale-extension://<확장프로그램ID>/tests/추가_정량검증/evaluation.html
  (Whale에서 whale-extension 형식이 열리지 않으면 chrome-extension 형식을 사용하세요.)

2. 실행 순서
① '상태 확인': 출처별 DB 건수, DNR 규칙 수, 피드 생성·반영 시각을 기록합니다.
② '등록된 활성 시그니처 인식률' 검사: URLhaus·PhishTank·PhishingDB·ThreatFox 각각 최대 50건(총 최대 200건)을 선택합니다.
③ '정상 URL 후보 오경고 검사': 같은 폴더의 SafeURLink_normal_candidates_500.csv를 선택하고 검사 수 500건으로 실행합니다.
④ '실제 등록된 DNR block 규칙 일치율' 검사: 설치된 block 규칙 중 최대 50건을 가상 요청으로 검사합니다.
⑤ 시험별 결과 CSV를 로컬에 저장하고 '요약 JSON 다운로드'로 결과를 보관합니다.

3. 제출 ZIP에 포함된 실제 평가 결과 (2026-11-14)
- SafeURLink_evaluation_summary.json은 당시 실행 결과를 기록한 증빙입니다.
- 등록 활성 시그니처: 200건 검사, Malicious 200건, 오류 0건, 등록 시그니처 인식률 100%.
- 정상 URL 후보: 500건 검사, 경고 0건, 오류 0건, 표본 오경고율 0%.
- 설치된 DNR block 규칙: 50건 가상 요청, 50건 일치, 오류 0건, 표본 규칙 일치율 100%.
- 검사 당시 실제 설치된 DNR block 규칙은 26,513개였으며, 표본은 그 일부만 선정했습니다.
- 재실행 시 피드 및 확장 프로그램 상태가 달라지면 결과도 달라질 수 있습니다.

4. 해석상의 제한 및 주의
- '등록 시그니처 인식률 100%'는 현재 DB에 이미 등록된 URL의 기능 시험이며 독립적 악성 URL 탐지율이 아닙니다.
- 정상 URL 후보의 label=0 표기는 데이터셋의 후보 라벨이며 독립적인 안전성 확인 결과가 아닙니다.
- DNR 규칙 매치는 testMatchOutcome() 가상 요청 결과이며 실제 악성 사이트 방문·전체 위협 차단율을 의미하지 않습니다.
- 검증 결과에는 검사 성공, 각 판정 수, 오류 수를 구분하여 기록합니다.
- 시그니처 부족, 중복 URL, 사용자 허용 규칙 및 데이터 갱신 상태에 따라 표본 수나 결과가 달라질 수 있습니다.
- CSV에는 검사에 사용한 URL이 포함될 수 있으므로 외부 공개 저장소에 올리지 마세요.

5. 제출 자료
- evaluation.html / evaluation.js: 추가 정량 검증 실행 도구
- SafeURLink_normal_candidates_500.csv: label=0인 정상 URL 후보 500건
- SafeURLink_evaluation_summary.json: 2026-11-14에 기록된 3개 추가 검증 결과 요약
- 개별 URL별 검사 결과 CSV는 별도 비공개로 보관할 수 있습니다.
