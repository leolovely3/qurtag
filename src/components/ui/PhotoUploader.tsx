import { useCallback, useRef, useState, type DragEvent } from 'react';
import { Camera, X } from 'lucide-react';
import { uploadItemPhoto } from '@/lib/queries';
import { cn } from '@/lib/cn';

interface PhotoUploaderProps {
  householdId: string | null;
  value: string | null;
  onChange: (url: string | null) => void;
  className?: string;
}

const ACCEPTED = 'image/jpeg,image/png,image/webp,image/heic,image/heif';

/** A phone or tablet: no mouse, so "drop one here" would mean nothing. */
function isTouchOnly(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(hover: none), (pointer: coarse)').matches;
}

export function PhotoUploader({ householdId, value, onChange, className }: PhotoUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touch] = useState(isTouchOnly);

  const handleFile = useCallback(
    async (file: File | null) => {
      setError(null);
      if (!file) return;
      if (!householdId) {
        setError('Hang on. Finding your account.');
        return;
      }
      if (file.size > 25 * 1024 * 1024) {
        setError('That photo is too large. Try another one.');
        return;
      }
      setUploading(true);
      const result = await uploadItemPhoto({ householdId, file });
      setUploading(false);
      if ('error' in result) {
        setError(result.error);
        return;
      }
      onChange(result.url);
    },
    [householdId, onChange],
  );

  const onDrop = useCallback(
    (e: DragEvent<HTMLLabelElement>) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files?.[0] ?? null;
      handleFile(file);
    },
    [handleFile],
  );

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <span className="text-sm font-medium text-ink-900">Photo (optional)</span>

      {value ? (
        <div className="relative overflow-hidden rounded-modal border border-hairline">
          <img src={value} alt="The photo finders see" className="aspect-[4/3] w-full bg-ink-50 object-cover" />
          <button
            type="button"
            onClick={() => onChange(null)}
            className="absolute right-2 top-2 grid size-11 place-items-center rounded-pill bg-black/60 text-white backdrop-blur transition-colors hover:bg-black/75"
            aria-label="Remove photo"
          >
            <X size={18} strokeWidth={2} aria-hidden />
          </button>
        </div>
      ) : (
        <label
          htmlFor="qurtag-photo"
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={cn(
            'flex min-h-48 cursor-pointer flex-col items-center justify-center gap-2 rounded-modal border border-dashed px-6 py-8 text-center',
            'transition-colors duration-150 ease-out focus-within:ring-2 focus-within:ring-ink-900/40',
            dragOver
              ? 'border-ink-900 bg-ink-50'
              : 'border-hairline-strong bg-paper hover:bg-ink-50 hover:border-ink-900/40',
            uploading && 'opacity-60 cursor-progress',
          )}
        >
          <div className="grid size-12 place-items-center rounded-pill bg-canvas shadow-card">
            {uploading ? (
              <div className="size-5 animate-spin rounded-full border-2 border-ink-100 border-t-ink-900" />
            ) : (
              <Camera size={22} strokeWidth={1.75} className="text-ink-900" aria-hidden />
            )}
          </div>
          <span className="text-base font-medium text-ink-900">
            {uploading ? 'Preparing…' : touch ? 'Take or choose a photo' : 'Choose a photo'}
          </span>
          <span className="max-w-xs text-sm text-muted text-pretty">
            {touch ? 'A clear photo helps the finder know they have the right thing.' : 'Or drop one here. A clear photo helps the finder know they have the right thing.'}
          </span>
        </label>
      )}

      <input
        ref={inputRef}
        id="qurtag-photo"
        type="file"
        accept={ACCEPTED}
        className="sr-only"
        onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
      />

      {!value && <span className="text-sm text-muted">The finder sees this photo.</span>}
      {error && <span role="alert" className="text-sm text-signal-700">{error}</span>}
    </div>
  );
}
