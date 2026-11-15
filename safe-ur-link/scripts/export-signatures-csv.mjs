// SafeURLink에서 배포한 시그니처 JSON을 CSV 파일로 저장합니다.
// 기본값은 GitHub Pages의 실제 피드이며, --input으로 로컬 JSON도 읽을 수 있습니다.
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, unlink } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { once } from 'node:events';
import { Readable } from 'node:stream';
import { SIGNATURE_FEED_URL } from '../core/config.js';

function optionsFromArgs(args) {
  const opt = { input: null, output: 'exports/signatures.csv', source: null, activeOnly: false, limit: Infinity };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--input' || arg === '--output' || arg === '--source' || arg === '--limit') {
      if (!args[i + 1]) throw new Error(`${arg} 뒤에 값을 입력해 주세요.`);
      const value = args[++i];
      if (arg === '--input') opt.input = value;
      if (arg === '--output') opt.output = value;
      if (arg === '--source') opt.source = value;
      if (arg === '--limit') {
        opt.limit = Number(value);
        if (!Number.isInteger(opt.limit) || opt.limit < 1) throw new Error('--limit는 1 이상의 정수여야 합니다.');
      }
    } else if (arg === '--active-only') {
      opt.activeOnly = true;
    } else {
      throw new Error(`알 수 없는 옵션: ${arg}`);
    }
  }
  return opt;
}

// 엑셀에서 수식으로 실행될 수 있는 텍스트를 일반 문자열로 보관합니다.
function csvCell(value) {
  let text = value === null || value === undefined ? '' : String(value);
  if (/^\s*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function csvRow(row) {
  const meta = row.meta || {};
  const values = [
    row.source, row.url,
    meta.active !== false, meta.verified === true, meta.online === true,
    meta.valid === true, Number.isFinite(meta.confidence) ? meta.confidence : '',
    meta.threat || '', meta.first_seen || '', meta.lastObservedAt || ''
  ];
  return values.map(csvCell).join(',') + '\r\n';
}

async function inputStream(input) {
  if (input) {
    console.log('로컬 파일:', resolve(input));
    return createReadStream(resolve(input));
  }
  console.log('배포된 피드:', SIGNATURE_FEED_URL);
  const res = await fetch(SIGNATURE_FEED_URL, {
    cache: 'no-store',
    signal: AbortSignal.timeout(600_000)
  });
  if (!res.ok || !res.body) throw new Error(`시그니처 다운로드 실패 (HTTP ${res.status})`);
  return Readable.fromWeb(res.body);
}

async function exportSignatures() {
  const opt = optionsFromArgs(process.argv.slice(2));
  const outputPath = resolve(opt.output);
  await mkdir(dirname(outputPath), { recursive: true });
  const source = await inputStream(opt.input);
  const output = createWriteStream(outputPath, { encoding: 'utf8' });
  let count = 0;
  const bySource = {};
  let done = false;
  let headerFound = false;
  let beforeList = '';
  let current = '';
  let depth = 0;
  let inQuote = false;
  let escapeNext = false;
  let rows = [];

  async function flush() {
    if (rows.length === 0) return;
    const text = rows.join('');
    rows = [];
    if (!output.write(text)) await once(output, 'drain');
  }

  try {
    // UTF-8 BOM을 넣어 Excel에서 한글 출처/위협 설명이 깨지지 않도록 합니다.
    output.write('\uFEFFsource,url,active,verified,online,valid,confidence,threat,first_seen,lastObservedAt\r\n');
    const decoder = new TextDecoder('utf-8');
    for await (const byteChunk of source) {
      let text = decoder.decode(byteChunk, { stream: true });
      if (!headerFound) {
        beforeList += text;
        const match = /"signatures"\s*:\s*\[/.exec(beforeList);
        if (!match) {
          beforeList = beforeList.slice(-100);
          continue;
        }
        text = beforeList.slice(match.index + match[0].length);
        headerFound = true;
        beforeList = '';
      }

      for (const ch of text) {
        if (depth === 0) {
          if (ch === ']') { done = true; break; }
          if (ch === ',' || /\s/.test(ch)) continue;
          if (ch !== '{') throw new Error('예상하지 않은 시그니처 JSON 형식입니다.');
          current = '{';
          depth = 1;
          inQuote = false;
          escapeNext = false;
          continue;
        }

        current += ch;
        if (inQuote) {
          if (escapeNext) escapeNext = false;
          else if (ch === '\\') escapeNext = true;
          else if (ch === '"') inQuote = false;
        } else if (ch === '"') {
          inQuote = true;
        } else if (ch === '{') {
          depth++;
        } else if (ch === '}') {
          depth--;
          if (depth === 0) {
            const item = JSON.parse(current);
            current = '';
            if (typeof item.url === 'string' && typeof item.source === 'string' &&
                (!opt.source || opt.source === item.source) &&
                (!opt.activeOnly || item.meta?.active !== false)) {
              rows.push(csvRow(item));
              count++;
              bySource[item.source] = (bySource[item.source] || 0) + 1;
              if (rows.length >= 2000) await flush();
              if (count >= opt.limit) { done = true; break; }
            }
          }
        }
      }
      if (done) break;
    }
    if (!headerFound || (!done && depth !== 0)) throw new Error('완전한 시그니처 배열을 찾지 못했습니다.');
    await flush();
    output.end();
    await once(output, 'finish');
    console.log(`CSV 저장 완료: ${outputPath}`);
    console.log(`총 ${count.toLocaleString('ko-KR')}건`);
    for (const [name, n] of Object.entries(bySource)) console.log(`  ${name}: ${n.toLocaleString('ko-KR')}건`);
    if (count > 1_048_575) console.log('주의: 엑셀 1개 시트의 최대 데이터 행 수를 넘습니다. --source 옵션으로 나누어 확인하세요.');
    console.log('주의: 악성 URL은 클릭하거나 브라우저로 방문하지 마세요.');
  } catch (err) {
    output.destroy();
    await unlink(outputPath).catch(() => {});
    throw err;
  } finally {
    source.destroy();
  }
}

exportSignatures().catch(err => {
  console.error('내보내기 실패:', err.message);
  process.exitCode = 1;
});
