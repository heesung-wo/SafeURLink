import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SIGNATURE_FEED_URL } from '../../core/config.js';

const EXPECTED_URL = 'https://heesung-wo.github.io/SafeURLink/signatures.json';

// GitHub 저장소 .git URL과 GitHub Pages에 공개된 JSON URL은 서로 다르다.
test('확장 프로그램이 새 저장소의 GitHub Pages 피드 주소를 사용', () => {
  assert.equal(SIGNATURE_FEED_URL, EXPECTED_URL);
  assert.ok(SIGNATURE_FEED_URL.endsWith('/signatures.json'));
  assert.ok(!SIGNATURE_FEED_URL.includes('github.com/'));
});

test('GitHub Actions가 갱신 전에 조회하는 이전 피드 주소가 확장 프로그램과 일치', async () => {
  const workflow = await readFile(new URL('../../../.github/workflows/update-signatures.yml', import.meta.url), 'utf8');
  const matched = workflow.match(/^\s*PREVIOUS_FEED_URL:\s*['"]([^'"]+)['"]/m);
  assert.ok(matched, '워크플로의 PREVIOUS_FEED_URL을 찾지 못했습니다.');
  assert.equal(matched[1], SIGNATURE_FEED_URL);
});

test('배포 안내가 구 저장소 경로를 참조하지 않음', async () => {
  for (const filename of ['../../README.md', '../../UPDATE_NOTES_v0.6.9.md']) {
    const content = await readFile(new URL(filename, import.meta.url), 'utf8');
    assert.ok(!content.includes('heesung-wo.github.io/Capstone/'), `${filename}: 구 피드 경로 남아 있음`);
    assert.ok(content.includes(EXPECTED_URL), `${filename}: 새 피드 경로가 안내되지 않음`);
  }
});
