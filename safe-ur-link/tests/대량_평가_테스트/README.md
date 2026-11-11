# SafeURLink 테스트 자료 및 재실행 방법

이 폴더에는 **2026-11-11 SafeURLink v0.6.9 코드 기준**으로 진행한 합성 URL 기능 검증과 DNR 규칙 생성 부하 시험을 다시 실행할 수 있는 코드, 입력 URL 데이터셋, 출력 결과가 포함되어 있습니다.

> **중요:** 이 데이터셋은 전부 예약된 `.test` 도메인으로 만든 **합성 URL**입니다. `label=1`(악성) / `label=0`(정상)은 실험자가 테스트 목적으로 정한 **가상 정답**이지, 외부 보안 기관에서 검증된 사실이 아닙니다. 그러므로 이 실험의 Accuracy, Precision, Recall, F1, FPR은 **실제 악성 URL 탐지 정확도**로 보고할 수 없습니다.

## 1. 기존 127개 자동화 테스트 (변경 없음)

아래 명령을 **`safe-ur-link` 폴더**에서 실행합니다.

```bash
npm test
```

기존 테스트 코드는 `tests/기능_테스트/*.test.mjs`에 있으며, URL 정규화/점수 계산, 시그니처 DB 처리, 데이터 수집, DNR 규칙 생성, 확장 기능 등의 **예상 결과와 실제 결과를 비교**합니다. 기존 실행에서 **127/127건 통과**했습니다. 여기 추가한 평가 코드는 기존 `npm test` 실행 목록에 포함되지 않습니다.

## 2. 합성 URL 10,000건 기능 검사

```bash
node tests/대량_평가_테스트/generate-dataset.mjs
node tests/대량_평가_테스트/run-synthetic-10000.mjs
```

- `fixtures/synthetic-10000-input.csv`: 입력한 합성 URL 10,000개와 가상 정답 (`group,url,label`).
- `generate-dataset.mjs`: 입력 CSV를 동일한 내용으로 다시 생성합니다.
- `run-synthetic-10000.mjs`: **실제 `background.check()` 함수**를 호출합니다. Node.js에서는 브라우저 IndexedDB가 없으므로, **임시 복사본**에서만 `core/db.js`를 메모리 어댑터로 대체하며 프로젝트의 실제 파일은 변경하지 않습니다. URL을 방문하거나 외부 API를 조회하지 않습니다.
- `results/synthetic-10000-results.csv`: URL별 판정 결과(판정/점수/출처/규칙 선정 여부/측정 시간).
- `results/synthetic-10000-summary.json`: 그룹별 결과, 가상 정답을 이용한 **설명용** 혼동행렬·지표.

| 가상 데이터 그룹 | 건수 | 기대 판정 |
|---|---:|---|
| 유효한 최신 시그니처 | 2,500 | Malicious |
| 과거 악성 시그니처 이력 | 500 | Suspicious |
| 미등록 / 위험 구조 적음 | 1,000 | No Threat Detected |
| 미등록 / 위험 구조 많음 | 1,000 | Suspicious |
| 일반 정상으로 *가정*한 합성 URL | 4,800 | No Threat Detected |
| 위험해 보이지만 정상으로 *가정*한 합성 URL | 200 | Suspicious |

테스트 결과는 10,000건 모두 미리 정의한 동작과 일치했습니다. 이는 **기능 회귀 테스트**의 일치 결과이며 보안 성능의 실측치가 아닙니다. 인메모리 DB 검사 시간도 실제 95만 건 규모 IndexedDB 검사 시간과 다릅니다.

## 3. 합성 시그니처 100,000건 DNR 규칙 생성 부하 시험

```bash
node tests/대량_평가_테스트/run-dnr-stress-100000.mjs
```

- 합성 URLhaus/PhishTank/PhishingDB/ThreatFox 시그니처를 각각 25,000건씩 만듭니다.
- 실제 `core/dnr.js`의 `buildProtectionRules()`에 넣어 소스별 상한을 확인합니다.
- 기대 생성 규칙: **URLhaus 9,000 + PhishTank 9,000 + PhishingDB 9,000 + ThreatFox 2,700 = 29,700개**.
- 결과: `results/dnr-stress-100000-summary.json`.

**주의:** 생성기의 자바스크립트 결과만 검사합니다. **Chrome DNR 설치/차단 실행을 측정한 결과가 아닙니다.**

## 4. 실제 DB + 독립 검증 URL 평가 도구 (추가 검증용, 미실행)

`browser/evaluate.html`, `browser/evaluate.js`는 실제 설치된 확장 프로그램의 검사 기능과 브라우저 DNR의 가상 요청을 이용하기 위한 **별도 도구**입니다.

1. Chrome에서 `chrome://extensions` → 개발자 모드 → **압축 해제된 확장 프로그램**으로 이 프로젝트의 `safe-ur-link` 폴더를 로드합니다.
2. DNR 가상 요청 평가에는 `manifest.json`의 `permissions`에 `declarativeNetRequestFeedback` 권한을 테스트 중 **임시로 추가**하고 확장 프로그램을 다시 로드해야 할 수 있습니다. 배포용 코드에서는 제거할 수 있습니다.
3. 확장 프로그램의 ID를 확인해 `chrome-extension://<확장프로그램ID>/tests/대량_평가_테스트/browser/evaluate.html`을 새 탭에서 엽니다.
4. **독립적으로 검증한 실제 악성/정상 URL CSV**(`url,label` 열 필수)를 선택해 검사합니다. `browser/real-url-template.csv`는 헤더만 있는 빈 형식 예시입니다.
5. 결과 CSV 및 성능 지표 JSON을 내려받습니다. 테스트 URL을 실제로 열지는 않습니다.

**매우 중요:** 이 폴더의 `fixtures/synthetic-10000-input.csv`를 실제 성능 평가에 사용하는 것은 적절하지 않습니다. 실제 성능은 별도로 확인한 URL의 출처, 라벨 검증 날짜, 피드 버전, 프로그램 버전을 기록하고 측정해야 합니다. 테스트 전에 사용자 허용/차단 목록 및 세션 예외를 비우고 데이터 갱신 상태를 고정하세요.

브라우저 평가 페이지의 코드는 포함했지만, **실제 사용자의 Chrome 및 실DB 환경에서 실행 성공을 보장하거나 이미 테스트했다고 주장하지 않습니다.**

## 5. 교수님께 설명할 수 있는 요약

“기존 자동화 테스트는 `npm test`로 127개를 실행해 함수의 예상 결과와 실제 결과를 비교했습니다. 추가로 10,000개의 가상 URL을 프로그램 검사 함수에 넣어 판정 동작을 확인했고, 10만 개의 가상 시그니처로 DNR 차단 규칙 29,700개가 생성되는지 검사했습니다. 다만 가상 데이터를 이용한 기능 검증과 실제 악성 URL 탐지 정확도는 구분했습니다.”
