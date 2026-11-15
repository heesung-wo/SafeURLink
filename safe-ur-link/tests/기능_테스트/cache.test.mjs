import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { cachedPhishTank } from '../../scripts/build-feed.mjs';

const sample = [{ url: 'https://phish.invalid/login', meta: { online: true, verified: true, valid: true, threat: 'phishing' } }];

async function withCache(fn) {
  const dir = await mkdtemp(path.join(tmpdir(), 'safeurlink-cache-'));
  const cacheFile = path.join(dir, '.cache', 'phishtank-daily.json');
  try { await fn(cacheFile); } finally { await rm(dir, { force: true, recursive: true }); }
}

test('PhishTank 캐시: 같은 UTC 날짜에는 첫 번째 수집 결과를 재사용한다', async () => {
  await withCache(async cacheFile => {
    let calls = 0;
    const run = () => cachedPhishTank(() => { calls++; return Promise.resolve(sample); }, { cacheFile, utcDay: () => '2026-11-07' });
    const a = await run();
    const b = await run();
    assert.equal(calls, 1);
    assert.deepEqual(b, a);
    const disk = JSON.parse(await readFile(cacheFile, 'utf8'));
    assert.equal(disk.day, '2026-11-07');
    assert.equal(JSON.stringify(disk).includes('apiKey'), false);
  });
});

test('PhishTank 캐시: UTC 날짜가 바뀌면 새 데이터를 받는다', async () => {
  await withCache(async cacheFile => {
    let calls = 0;
    const collect = () => { calls++; return Promise.resolve(sample); };
    await cachedPhishTank(collect, { cacheFile, utcDay: () => '2026-11-07' });
    await cachedPhishTank(collect, { cacheFile, utcDay: () => '2026-11-08' });
    assert.equal(calls, 2);
  });
});

test('PhishTank 캐시: 훼손되거나 잘못된 캐시는 원본을 다시 수집한다', async () => {
  await withCache(async cacheFile => {
    // 캐시 디렉터리는 수집기가 직접 생성한다.
    let calls = 0;
    const collect = () => { calls++; return Promise.resolve(sample); };
    await cachedPhishTank(collect, { cacheFile, utcDay: () => '2026-11-07' });
    await writeFile(cacheFile, JSON.stringify({version:1,day:'2026-11-07',records:[{url:'javascript:alert(1)',meta:{}}]}));
    await cachedPhishTank(collect, { cacheFile, utcDay: () => '2026-11-07' });
    assert.equal(calls, 2);
  });
});

test('PhishTank 캐시: API 실패 시 기존 캐시 파일을 삭제하지 않는다', async () => {
  await withCache(async cacheFile => {
    await cachedPhishTank(async () => sample, { cacheFile, utcDay: () => '2026-11-07' });
    const original = await readFile(cacheFile, 'utf8');
    await assert.rejects(
      cachedPhishTank(async () => { throw new Error('API offline'); }, { cacheFile, utcDay: () => '2026-11-08' }),
      /API offline/
    );
    assert.equal(await readFile(cacheFile, 'utf8'), original);
  });
});
