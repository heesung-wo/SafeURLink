# SafeURLink

**안전한 인터넷을 위한 시그니처 기반 악성 URL 탐지 및 브라우저 보호**

SafeURLink는 Chrome/Whale(Chromium)용 Manifest V3 확장 프로그램입니다. 외부 위협 정보를 통합한 로컬 시그니처 DB와 URL 문자열 분석을 이용해 주소의 위험도를 표시하고, 선정된 악성 URL에 대한 접속을 브라우저 DNR 규칙으로 차단합니다.

## 주요 기능

1. URL 직접 검사 - URL 직접 입력, 현재 탭 및 선택한 URL 텍스트 우클릭 검사 
2. 위험도 평가 - 외부 시그니처(최대 60점)와 URL 휴리스틱(최대 40점)을 결합하여 `Malicious`, `Suspicious`, `No Threat Detected`로 표시 
3. 시그니처 통합 - URLhaus, PhishTank, Phishing.Database, ThreatFox 정보를 수집·정규화·중복 처리하여 공개 피드로 배포 
4. 누적 데이터 관리 - IndexedDB에 저장하며, 새 수집에 없는 과거 항목의 이력을 보존하고 수집 실패 시 해당 출처의 기존 기록 유지 
5. 실시간 보호 - `declarativeNetRequest`로 선정된 외부 악성 URL `block`; 사용자가 지정한 차단 도메인은 경고 페이지로 `redirect`
6. 사용자 설정 - 허용·차단 목록, 실시간 보호 활성화, 일시적 접근 허용
7. 데이터 갱신 - GitHub Actions에서 공개 피드 생성, 확장 프로그램에서 배포된 데이터를 주기적으로 확인·반영

> `No Threat Detected`는 **해당 시점의 데이터와 규칙에서 위험이 발견되지 않았음**을 의미하며, URL이 안전하다는 보증이 아닙니다. 

## 시스템 구조

```text
GitHub Actions (.github/workflows/update-signatures.yml)
  └─ safe-ur-link/scripts/build-feed.mjs
      └─ safe-ur-link/core/feeds.js (외부 위협 정보 수집)
           ↓
        public/signatures.json (GitHub Pages 배포)
           ↓
Chrome/Whale 확장 프로그램
  ├─ background/background.js (검사 요청·갱신·DNR 관리)
  ├─ core/db.js (IndexedDB)
  ├─ core/common.js (URL 분석·위험도)
  ├─ core/dnr.js (차단 규칙 선정)
  └─ pages/ (팝업·검사 결과·경고·설정)
...
```

- 원본 외부 API와 인증키는 GitHub Actions에서 사용하며 확장 프로그램은 공개 피드를 내려받습니다.
- `safe-ur-link/`는 확장 프로그램이 설치되는 **내부 폴더 경로**입니다. 기존 로컬 DB 및 설치된 확장 프로그램과의 호환성을 위해 유지합니다.

## 설치 및 사용

1. 압축을 풀고 Chrome/Whale 확장 프로그램 관리(`chrome://extensions`, Whale의 확장 프로그램 관리)에서 **개발자 모드**를 활성화합니다.
2. **압축 해제된 확장 프로그램 로드**에서 `SafeURLink/safe-ur-link/` 폴더를 선택합니다. `manifest.json`이 있는 폴더입니다.
3. SafeURLink 설정 화면에서 시그니처가 준비되었는지 확인하고 필요하면 **지금 업데이트**를 실행합니다.
4. 팝업에서 URL 검사, 실시간 보호, 사용자 허용·차단 기능을 이용합니다.

**이미 설치된 확장 프로그램을 사용하는 경우:** 설치된 확장 프로그램을 삭제하지 않고 기존 폴더의 파일을 교체한 다음 **확장 프로그램 새로고침**을 하세요. 확장 프로그램을 삭제해 다시 설치하면 로컬 IndexedDB가 초기화될 수 있습니다. 파일 경로나 설치 ID가 달라지지 않게 주의하세요.

## 위협 정보 수집과 자동 갱신

- **GitHub Actions:** 현재 설정은 한국 시간 **매일 00:17** 예약 수집입니다(UTC `15:17`). GitHub의 `schedule`은 지연·누락될 수 있으며 `workflow_dispatch`로 수동 실행할 수 있습니다.
- **확장 프로그램:** 한국 시간 **매일 15:00** 공개 피드를 확인합니다. 브라우저 종료 중 놓친 확인은 다음 시작 때 보충하고, 실패하면 1시간 후 재시도합니다. 원본 API에 직접 접속하지 않습니다.
- **데이터 보호:** 이전 공개 피드를 병합하여 누적 이력을 유지합니다. 선택 수집원에 문제가 생기면 해당 데이터의 기존 이력을 보존하고, 필수 소스 수집 실패 또는 전체 수집 실패 시 배포하지 않도록 구성했습니다.
- **초기 배포 주의:** `.github/workflows/update-signatures.yml`의 `PREVIOUS_FEED_URL`, `ALLOW_FIRST_DEPLOY`, 공개 배포 허용 설정 및 Secrets를 확인하세요. 현재 저장소에 공개 피드가 있다면 기존 데이터를 덮어쓰지 않도록 최초 배포 허용을 켜지 마세요.
- **재배포 조건:** URLhaus, PhishTank, Phishing.Database, ThreatFox의 데이터 사용·재배포 조건을 각각 확인해야 합니다. 공개 URL 목록을 별도 저장소에 임의로 재업로드하지 마세요.

## URL 검사 및 DNR 보호 범위

- 직접 검사는 누적 DB 전체를 조회하며 현재 유효한 악성 시그니처가 일치하면 `Malicious`로 판정합니다. 과거 이력만 있으면 현재 악성 여부가 확정되지 않은 것으로 처리합니다.
- DNR은 시그니처 전체가 아니라 출처별 선정 상한(URLhaus 9,000건, PhishTank 9,000건, PhishingDB 9,000건, ThreatFox 2,700건)을 적용합니다. 외부 시그니처 차단 규칙의 상한은 총 **29,700개**이고, 별도 사용자 차단 도메인 규칙은 최대 **300개**입니다.
- 외부 위협 규칙은 **전체 URL** 중심으로 `main_frame` 이동을 차단합니다. 같은 도메인의 다른 경로까지 자동으로 모두 차단하지 않습니다. 사용자가 등록한 차단 도메인은 별도 규칙을 적용합니다.
- 실제 적용 규칙 수는 중복, 과거 이력, DNR 필터 표현 제한, 사용자 허용 설정 등에 따라 최대치보다 작을 수 있습니다.
- 브라우저의 DNR 차단 결과와 실제 악성 URL 탐지 정확도는 별도로 평가해야 합니다.

## 시그니처 목록 CSV 내보내기

실제 수집된 URL과 출처별 메타데이터를 확인하려면 `scripts/export-signatures-csv.mjs`를 사용합니다. **프로젝트에 포함된 `public/signatures.json`은 시연용 2건이므로, 기본 명령은 GitHub Pages에 배포된 실제 피드를 내려받습니다.** CSV는 엑셀에서 열 수 있지만, 악성 URL을 클릭하거나 방문하지 마세요.

Windows PowerShell에서는 `npm.ps1` 제한을 피하려면 `npm.cmd`를 사용할 수 있습니다. 아래 명령은 `safe-ur-link/` 폴더에서 실행하세요(Node.js 20 이상 필요).

```powershell
# 실제 배포된 피드를 모두 CSV로 저장
npm.cmd run export:csv

# 현재 활성 상태인 10,000건만 확인
npm.cmd run export:csv -- --active-only --limit 10000 --output exports/sample-10000.csv

# 특정 출처만 확인
npm.cmd run export:csv -- --source PhishingDB --output exports/phishingdb.csv

# 로컬에 저장된 JSON을 변환(시연용/오프라인 점검)
npm.cmd run export:csv -- --input public/signatures.json --output exports/demo.csv
```

기본 출력 위치는 `safe-ur-link/exports/signatures.csv`입니다. CSV에는 `source`, `url`, `active`, `verified`, `online`, `valid`, `confidence`, `threat`, `first_seen`, `lastObservedAt` 열이 들어갑니다.

- `active=false`는 과거 이력으로 보관된 시그니처를 의미합니다. `active=true`여도 마지막 관측 시점 등이 오래된 경우 직접 검사는 `Suspicious`가 될 수 있습니다.
- CSV는 **배포된 피드 시점**의 정보입니다. 확장 프로그램에서 사용하는 **IndexedDB**와 갱신 시각이 다르면 직접 검사 결과와 차이가 날 수 있습니다.
- CSV 출력 폴더 `exports/`는 `.gitignore`로 Git 업로드에서 제외합니다. 공개 저장소나 보고서에 악성 URL 전체 목록을 첨부하지 마세요.
- 데이터 건수가 Excel 단일 시트 행 제한(총 1,048,576행)에 가까워질 경우 `--source`로 나누어 저장하세요.

## 개발·테스트

Node.js 20 이상을 설치하고 `safe-ur-link/` 폴더에서 실행합니다. PowerShell에서 `npm`이 차단되면 `npm.cmd`를 사용하세요.

```powershell
npm.cmd test
npm.cmd run eval:synthetic
npm.cmd run stress:dnr
```

테스트 - 대상과 의미
1. `tests/기능_테스트/` - 124개 기능별 테스트: URL 처리, 시그니처 관리, 갱신, DNR 규칙 생성, 사용자 입력 등
2. `tests/대량_평가_테스트/` - 합성 URL 10,000건 판정 기능 검사, 합성 시그니처 100,000건 DNR 규칙 생성 시험

### 추가 정량 검증 (2026-11-14)

`safe-ur-link/tests/추가_정량검증/`에는 실제 브라우저의 IndexedDB·검사 메시지·설치된 DNR 규칙을 사용한 **추가 검증 도구와 결과 자료**가 들어 있습니다. 일반 사용자가 사용하는 확장 프로그램 기능이 아닌 **검증용 내부 페이지**입니다.

| 검사 대상 | 검사 규모 | 당시 결과 | 의미 |
| --- | ---: | --- | --- |
| DB 등록 활성 악성 시그니처 | 200건 (4개 출처 각 50건) | 200건 `Malicious`, 오류 0건 | **등록 시그니처 인식률 100%** |
| 정상 URL 후보 | 500건 | 500건 `No Threat Detected`, 오류 0건 | **표본 오경고율 0%** |
| 실제 설치된 DNR `block` 규칙 | 50건 | 가상 요청 50건 일치, 오류 0건 | **표본 규칙 일치율 100%** |

이 시험은 2026-11-14에 실행했으며, 당시 로컬 DB는 955,575건(출처별 건수 합계), 설치된 DNR 차단 규칙은 26,513개였습니다. 상세 집계는 `tests/추가_정량검증/SafeURLink_evaluation_summary.json`에 기록되어 있습니다. **등록 시그니처 조회 성능과 실제 미등록 악성 URL 탐지율은 다르며, 정상 후보 오경고율과 DNR 가상 요청 일치율도 전체 성능을 의미하지 않습니다.** 별도 KISA 2023 피싱 URL 17,842건 시험에서는 악성·의심 판정이 발생하지 않아 탐지 범위의 한계를 확인했습니다.

**재실행 방법:**

1. Whale/Chrome 확장 프로그램 관리 화면에서 `safe-ur-link/`를 로드하거나 새로고침합니다. 기존 데이터가 필요하면 삭제 후 재설치하지 마세요.
2. 확장 프로그램 ID를 확인하고 `chrome-extension://<확장프로그램ID>/tests/추가_정량검증/evaluation.html`을 엽니다. Whale은 `whale-extension://` 주소를 사용하거나, 열리지 않으면 `chrome-extension://`을 시도합니다.
3. **상태 확인 → 등록된 활성 시그니처 인식률 → 정상 URL 후보 오경고 검사 → DNR block 규칙 일치율** 순서로 실행합니다. 정상 후보 시험에는 같은 폴더의 `SafeURLink_normal_candidates_500.csv`를 선택하고 기본값 **500건**으로 실행합니다.
4. 각각의 결과 CSV와 전체 요약 JSON을 저장합니다. 세부 방법과 주의점은 `tests/추가_정량검증/README.txt`를 참고하세요.

**주의:** 악성 URL에 실제 접속하지 않으며 개별 URL을 포함하는 CSV는 외부 공개 저장소에 올리지 마세요. 재실행 시 데이터 갱신 상태가 달라지면 검사 결과도 달라질 수 있습니다.

테스트의 재실행 방법과 합성 데이터 형식은 `tests/대량_평가_테스트/README.md`에 정리했습니다. **합성 데이터 시험이나 기능 테스트 통과율은 실제 악성 URL의 탐지율·오탐률이 아닙니다.** 실제 탐지 정확도를 확인하려면 별도의 검증된 악성·정상 URL 데이터셋과 정답 비교가 필요합니다.

## 검증 범위와 한계

- 알려진 악성 URL과 일치하는 경우에는 탐지할 수 있지만, 시그니처 DB에 없는 신규 위협은 탐지하지 못할 수 있습니다.
- 미등록 URL은 문자열 특징에 따른 휴리스틱으로 판단하므로 정상 URL도 `Suspicious`로 표시될 수 있습니다.
- DNR 차단 규칙은 개수 제한으로 전체 시그니처의 일부만 적용합니다. 규칙 생성 시험과 실제 브라우저 차단 확인은 별개의 테스트입니다.
- GitHub Actions 예약 실행은 지연되거나 누락될 수 있으므로 피드 생성 시각과 확장 프로그램 갱신 상태를 별도로 확인해야 합니다.
