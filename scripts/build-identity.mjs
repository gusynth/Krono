import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
const { number } = JSON.parse(await readFile('shared/build.json', 'utf8'));
assert.ok(Number.isInteger(number) && number > 0 && number <= 65535, 'Invalid build number');
await mkdir('.test-data/generated', { recursive: true });
await writeFile('.test-data/generated/build-number.nsh', `!define KRONO_BUILD_NUMBER ${number}\n`);
