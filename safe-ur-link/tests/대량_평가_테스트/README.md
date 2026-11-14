# 대량 평가 테스트

가상 데이터로 SafeURLink의 **기능 일치 여부와 DNR 규칙 생성 상한**을 확인합니다. 아래 명령은 모두 `safe-ur-link/` 폴더에서 실행합니다. (Node.js 20 이상)

## 실행 방법

```powershell
npm.cmd test                # 기능 테스트 124건
npm.cmd run eval:synthetic  # 합성 URL 10,000건
npm.cmd run stress:dnr      # 합성 시그니처 100,000건
```

| 시험 | 확인 내용 | 기존 실행 결과 |
| --- | --- | --- |
| 기능 테스트 | URL 처리·DB·DNR 등 주요 기능 | 124/124건 통과 |
| 합성 URL 10,000건 | 미리 정의한 기대 판정과 실제 결과 비교 | 10,000건 일치 |
| 합성 시그니처 100,000건 | 출처별 DNR 규칙 선정 상한 확인 | 29,700개 생성 |

## 입력 및 결과 파일

- `fixtures/synthetic-10000-input.csv`: 합성 URL 입력 데이터. `generate-dataset.mjs`로 다시 생성할 수 있습니다.
- `results/synthetic-10000-results.csv`: URL별 검사 결과.
- `results/synthetic-10000-summary.json`: 합성 URL 시험 요약.
- `results/dnr-stress-100000-summary.json`: DNR 규칙 생성 시험 요약.

합성 URL 시험은 실제 검사 코드를 사용하되, Node.js 환경에서 **임시 메모리 DB**를 사용합니다. 프로젝트 원본 DB 코드는 변경하지 않습니다.

**주의:** 합성 데이터 시험은 실제 악성 URL의 탐지율·오탐률을 의미하지 않으며, DNR 규칙 생성 결과는 실제 브라우저 차단 성공률이 아닙니다. URL에 직접 접속하지 않습니다.
