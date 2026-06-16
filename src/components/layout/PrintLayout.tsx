import { Outlet } from 'react-router-dom';

/**
 * Used for /app/tags/:tagId/print.
 *
 * - No app chrome.
 * - Print CSS: hide the toolbar, fix A4 size, white background only.
 */
export function PrintLayout() {
  return (
    <div className="min-h-screen bg-paper text-ink-900 antialiased print:bg-canvas">
      <Outlet />
      <style>{`
        @media print {
          body { background: white !important; }
          .no-print { display: none !important; }
          @page { size: Letter; margin: 0.5in; }
        }
      `}</style>
    </div>
  );
}
