// SafeURLink synthetic fixture generator. All domains end in reserved .test.
// The labels below are constructed assumptions, NOT independently verified security ground truth.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const home = path.dirname(fileURLToPath(import.meta.url));
export const datasetPath = path.join(home, 'fixtures', 'synthetic-10000-input.csv');
export const SOURCES = Object.freeze(['URLhaus', 'PhishTank', 'PhishingDB', 'ThreatFox']);
const pad = i => String(i).padStart(5, '0');

// Exact test-set layout used for the documented 10,000-case synthetic evaluation.
export function createDataset() {
  const rows = [];
  const add = (group, url, label) => rows.push({ group, url, label });
  for (let i = 0; i < 2500; i++) add('known_active', `https://verified-malicious-${pad(i)}.test/a/payload-${i}`, 1);
  for (let i = 0; i < 500; i++) add('known_historical', `https://historical-malicious-${pad(i)}.test/archive-${i}`, 1);
  for (let i = 0; i < 1000; i++) add('unseen_no_indicators', `https://unknown-malicious-${pad(i)}.test/payload-${i}`, 1);
  for (let i = 0; i < 1000; i++) {
    add('unseen_heuristic_signals',
      'http://user@a.b.c.xn--e1afmkfd.test/login/verify/account/' + 'encoded_%20'.repeat(10) + `?id=${i}&_a=1&_b=2&_c=3&_d=4`, 1);
  }
  for (let i = 0; i < 4800; i++) add('benign_simple', `https://benign-site-${pad(i)}.test/home`, 0);
  for (let i = 0; i < 200; i++) {
    add('benign_adversarial_synthetic',
      'http://user@a.b.c.xn--e1afmkfd.test/login/verify/account/' + 'encoded_%20'.repeat(10) + `?case=${i}&a=1&b=2&c=3&d=4`, 0);
  }
  if (rows.length !== 10000 || new Set(rows.map(x => x.url)).size !== 10000) {
    throw Error('Dataset must contain 10,000 distinct URLs.');
  }
  return rows;
}

// Parser tailored to this controlled input fixture; do not use on untrusted, arbitrary CSV.
export function readDataset() {
  const text = fs.readFileSync(datasetPath, 'utf8');
  const lines = text.trimEnd().split(/\r?\n/);
  if (lines.shift() !== 'group,url,label') throw Error('Unexpected fixture header');
  return lines.map((line, i) => {
    const first = line.indexOf(','), last = line.lastIndexOf(',');
    if (first < 0 || last <= first) throw Error(`Malformed fixture row ${i + 2}`);
    const group = line.slice(0, first), url = line.slice(first + 1, last), label = Number(line.slice(last + 1));
    if (!['0','1'].includes(String(label)) || !url.endsWith('.test') && !url.includes('.test/')) {
      throw Error(`Unexpected fixture value in row ${i + 2}`);
    }
    return {group, url, label};
  });
}

export function writeDataset() {
  const rows = createDataset();
  fs.mkdirSync(path.dirname(datasetPath), {recursive:true});
  fs.writeFileSync(datasetPath, 'group,url,label\n' + rows.map(r => `${r.group},${r.url},${r.label}`).join('\n') + '\n');
  return rows.length;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(`합성 URL ${writeDataset().toLocaleString()}개 생성: ${datasetPath}`);
}
