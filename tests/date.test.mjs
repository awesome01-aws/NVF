import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/utils/dateUtils.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { getCameroonTodayISO } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

test('farm calendar uses Cameroon day around UTC midnight', () => {
  assert.equal(getCameroonTodayISO(new Date('2026-09-27T22:59:00Z')), '2026-09-27');
  assert.equal(getCameroonTodayISO(new Date('2026-09-27T23:01:00Z')), '2026-09-28');
});
