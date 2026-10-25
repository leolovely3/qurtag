import { useState } from 'react';
import { Copy, Download, ExternalLink, Printer, Share } from 'lucide-react';
import { buttonClasses } from '@/components/ui/Button';
import { chromeIntentUrl, inAppBrowserName, isAndroid } from '@/lib/inAppBrowser';
import { isNative, publicUrl } from '@/lib/platform';
import { saveTagPdf } from '@/lib/tagExport';
import { pageToSvg } from '@/lib/tagSvg';
import { PAPERS, type PaperId } from '@/lib/tagLayout';
import type { Page } from '@/lib/tagScene';

/**
 * The page the printer gets: the sheet at true size, hidden on screen. Every screen that prints
 * a sheet (the tag page, several items on one page, the first-tag walkthrough) puts this once.
 */
export function PrintArea({ sheet, paper }: { sheet: Page | null; paper: PaperId }) {
  const p = PAPERS[paper];
  return (
    <>
      <style>{`@media print { body { background: white !important; } @page { size: ${p.w}in ${p.h}in; margin: 0; } }`}</style>
      {sheet && (
        <div
          aria-hidden
          className="hidden bg-white print:fixed print:left-0 print:top-0 print:z-[200] print:block print:overflow-hidden"
          style={{ width: `${p.w}in`, height: `${p.h}in` }}
          dangerouslySetInnerHTML={{ __html: pageToSvg(sheet) }}
        />
      )}
    </>
  );
}

export type PrintChoice = 'print' | 'download_pdf';

/**
 * Print, or save the PDF, as two equal choices on the web: many people have no printer at hand
 * and print later from a computer, a library or a print shop. The iPhone app has one button,
 * which opens the share sheet (Print, Save to Files, AirDrop).
 *
 * Inside another app's browser (Facebook, Instagram and the like) printing usually does nothing,
 * so a notice comes first with the way out: copy the link, or on Android open it in Chrome.
 */
export function PrintChoices({
  sheet,
  fileName,
  onDone,
  linkPath,
  size = 'lg',
}: {
  sheet: Page | null;
  fileName: string;
  /** Called after the print dialog opened or the file was made. */
  onDone: (choice: PrintChoice) => void;
  /** The address to open in another browser, from the site root (for example /app/tags/x/print). */
  linkPath: string;
  size?: 'md' | 'lg';
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const native = isNative();

  async function save(dialogTitle: string, choice: PrintChoice) {
    if (!sheet) return;
    setError('');
    setBusy(true);
    try {
      await saveTagPdf(sheet, fileName, dialogTitle);
      onDone(choice);
    } catch (err) {
      if (!/cancel/i.test(err instanceof Error ? err.message : '')) setError('The tag could not be prepared. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  if (native) {
    return (
      <div className="flex flex-col gap-2">
        <button type="button" disabled={busy || !sheet} onClick={() => void save('Print your tags', 'print')} className={buttonClasses({ variant: 'primary', size, block: true })}>
          <Share size={18} aria-hidden />
          {busy ? 'Preparing…' : 'Print or share'}
        </button>
        <p className="text-sm text-muted text-pretty">Print or share opens the share sheet: print it, save it to Files or AirDrop it to a computer.</p>
        {error && <p role="alert" className="text-sm text-signal-700">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <InAppBrowserNotice linkPath={linkPath} />
      <div className="grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          disabled={!sheet}
          onClick={() => {
            onDone('print');
            window.print();
          }}
          className={buttonClasses({ variant: 'primary', size, block: true })}
        >
          <Printer size={18} aria-hidden />
          Print now
        </button>
        <button type="button" disabled={busy || !sheet} onClick={() => void save('Save your tags', 'download_pdf')} className={buttonClasses({ variant: 'primary', size, block: true })}>
          <Download size={18} aria-hidden />
          {busy ? 'Preparing…' : 'Save the PDF'}
        </button>
      </div>
      <p className="text-sm text-muted text-pretty">
        No printer here? Save the PDF and print it later on a computer, or at a library or a print shop. Print at 100%
        (actual size), with no scaling or "fit to page".
      </p>
      {error && <p role="alert" className="text-sm text-signal-700">{error}</p>}
    </div>
  );
}

/** Shown only inside another app's browser. */
export function InAppBrowserNotice({ linkPath }: { linkPath: string }) {
  const [copied, setCopied] = useState(false);
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  const app = inAppBrowserName(ua);
  if (!app) return null;
  const url = publicUrl(linkPath);
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      window.prompt('Copy this link, then open it in Safari or Chrome:', url);
    }
  }
  return (
    <div role="note" className="flex flex-col gap-3 rounded-card border border-signal-200 bg-signal-50 p-4">
      <p className="text-base font-semibold text-ink-900">Open in Safari or Chrome to print</p>
      <p className="text-sm text-ink-700 text-pretty">
        You are in {app}'s own browser, which usually cannot print or save files. Copy the link and open it in Safari or
        Chrome. You may need to sign in again there.
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => void copy()} className={buttonClasses({ variant: 'secondary' })}>
          <Copy size={16} aria-hidden />
          {copied ? 'Link copied' : 'Copy the link'}
        </button>
        {isAndroid(ua) && (
          <a href={chromeIntentUrl(url)} className={buttonClasses({ variant: 'secondary' })}>
            <ExternalLink size={16} aria-hidden />
            Open in Chrome
          </a>
        )}
      </div>
    </div>
  );
}
