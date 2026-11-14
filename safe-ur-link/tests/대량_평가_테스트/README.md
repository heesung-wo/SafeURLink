# SafeURLink 테스트 자료 및 재실행 방법

이 폴더에는 **SafeURLink 검사 코드**로 수행하는 합성 URL 기능 검증과 DNR 규칙 생성 부하 시험을 다시 실행할 수 있는 코드, 입력 URL 데이터셋, 출력 결과가 포함되어 있습니다.

> **중요** 해당 test는 합성 데이터를 이용해 SafeURLink가 **많은 URL과 시그니처 데이터를 처리할 때 정상적으로 동작하는지 확인**하기 위한 도구이며, **실제 악성 URL 탐지 정확도**로 보고할 수 없습니다.

## 1. 기능 자동화 테스트 124건

아래 명령을 **`safe-ur-link` 폴더**에서 실행합니다.

```bash
npm test
```

기존 테스트 코드는 `tests/기능_테스트/*.test.mjs`에 있으며, 시그니처 DB 처리, 데이터 수집, DNR 규칙 생성, 확장 기능 등의 **예상 결과와 실제 결과를 비교**합니다. 기존 실행에서 **124/124건 통과**했습니다. 여기 추가한 평가 코드는 기존 `npm test` 실행 목록에 포함되지 않습니다.

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

## 4. 테스트 결과 해석

- 합성 URL 10,000건 시험은 **의도한 분류 규칙이 대량 입력에서 정상 동작하는지** 확인합니다. 독립적으로 검증된 실제 악성·정상 URL에 대한 탐지율/오탐률 평가가 아닙니다.
- 합성 시그니처 100,000건 시험은 **차단 후보를 선정하고 규칙 객체를 생성하는 코드**를 검사합니다. 실제 Chrome DNR 엔진이 모든 규칙을 적용하는지까지 확인하는 것은 아닙니다.
- 시그니처 CSV가 필요한 경우 `npm.cmd run export:csv`로 공개 피드를 내려받을 수 있습니다. CSV의 URL을 실제로 방문하지 마세요. 자세한 사용법은 프로젝트 루트의 `README.md`를 참고하세요.
