/** saveFile: the browser downloads, the iPhone app shares, and a failure reaches the caller. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { saveFile, type SaveFileInput } from '../../../src/lib/saveFile.ts';

const file: SaveFileInput = { filename: 'qurtag-my-data.json', mime: 'application/json', text: '{}' };

test('on the web the file is downloaded and the share sheet is not used', async () => {
  const calls: string[] = [];
  await saveFile(file, { native: () => false, webDownload: () => void calls.push('web'), nativeShare: async () => void calls.push('native') });
  assert.deepEqual(calls, ['web']);
});

test('in the iPhone app the file is shared and no browser download is attempted', async () => {
  const calls: string[] = [];
  await saveFile(file, { native: () => true, webDownload: () => void calls.push('web'), nativeShare: async () => void calls.push('native') });
  assert.deepEqual(calls, ['native']);
});

test('a failed write reaches the caller', async () => {
  await assert.rejects(
    saveFile(file, { native: () => true, webDownload: () => {}, nativeShare: async () => { throw new Error('disk full'); } }),
    /disk full/,
  );
});
