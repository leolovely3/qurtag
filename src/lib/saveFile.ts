/**
 * Gives the person a file they asked for.
 *
 * On the web the browser downloads it. In the iPhone app a download is silently dropped by the
 * web view, so the file is written to the app's cache with @capacitor/filesystem and handed to
 * the iOS share sheet (Save to Files, AirDrop, Mail), the same way the tag PDF is
 * (src/lib/tagExport.ts). Any failure is thrown for the caller to show; closing the share sheet
 * without choosing anything is not a failure.
 */
import { isNative } from './platform';
import { toBase64 } from './tagPdf';

export interface SaveFileInput {
  filename: string;
  mime: string;
  /** Text content, or `bytes` for a binary file such as a PDF or PNG. One of the two. */
  text?: string;
  bytes?: Uint8Array;
  /** Title of the iOS share sheet. */
  dialogTitle?: string;
}

export interface SaveFileDeps {
  native: () => boolean;
  webDownload: (f: SaveFileInput) => void;
  nativeShare: (f: SaveFileInput) => Promise<void>;
}

const realDeps: SaveFileDeps = {
  native: isNative,
  webDownload: (f) => {
    const url = URL.createObjectURL(new Blob([f.bytes ?? f.text ?? ''], { type: f.mime }));
    const a = document.createElement('a');
    a.href = url;
    a.download = f.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
  nativeShare: async (f) => {
    const [{ Filesystem, Directory, Encoding }, { Share }] = await Promise.all([
      import('@capacitor/filesystem'),
      import('@capacitor/share'),
    ]);
    const file = await Filesystem.writeFile(
      f.bytes
        ? { path: f.filename, data: toBase64(f.bytes), directory: Directory.Cache }
        : { path: f.filename, data: f.text ?? '', directory: Directory.Cache, encoding: Encoding.UTF8 },
    );
    try {
      await Share.share({ title: 'QuR Tag', dialogTitle: f.dialogTitle ?? 'Save your file', url: file.uri });
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      if (!/cancel/i.test(message)) throw err;
    }
  },
};

export async function saveFile(f: SaveFileInput, deps: SaveFileDeps = realDeps): Promise<void> {
  if (deps.native()) await deps.nativeShare(f);
  else deps.webDownload(f);
}
