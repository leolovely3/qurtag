import { useCallback, useRef, useState, type DragEvent } from 'react';
import { Camera, Upload, X } from 'lucide-react';
import { uploadItemPhoto } from '@/lib/queries';
import { cn } from '@/lib/cn';

interface PhotoUploaderProps {
  householdId: string | null;
  value: string | null;
  onChange: (url: string | null) => void;
  className?: string;
}

const ACCEPTED = 'image/jpeg,image/png,image/webp,image/heic,image/heif';

export function PhotoUploader({ householdId, value, onChange, className }: PhotoUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback(
    async (file: File | null) => {
      setError(null);
      if (!file) return;
      if (!householdId) {
        setError('Hang on. Finding your account.');
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        setError('Photos must be under 10 MB.');
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
      <span className="text-caption font-medium text-ink-900">Photo</span>

      {value ? (
        <div className="relative rounded-card overflow-hidden border border-hairline-strong group">
          <img src={value} alt="" className="w-full aspect-[4/3] object-cover bg-ink-50" />
          <button
            type="button"
            onClick={() => onChange(null)}
            className="absolute top-2 right-2 size-8 grid place-items-center rounded-pill bg-ink-900/85 text-canvas hover:bg-ink-900 transition-colors duration-cairn opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
            aria-label="Remove photo"
          >
            <X size={14} strokeWidth={2} />
          </button>
        </div>
      ) : (
        <label
          htmlFor="cairn-photo"
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={cn(
            'flex flex-col items-center justify-center gap-2 aspect-[4/3] rounded-card border border-dashed cursor-pointer',
            'transition-colors duration-cairn ease-cairn',
            dragOver
              ? 'border-ink-900 bg-ink-50'
              : 'border-hairline-strong bg-paper hover:bg-ink-50 hover:border-ink-900/40',
            uploading && 'opacity-60 cursor-progress',
          )}
        >
          <div className="size-10 rounded-pill bg-canvas grid place-items-center shadow-card">
            {uploading ? (
              <div className="size-4 rounded-full border-2 border-ink-100 border-t-ink-900 animate-spin" />
            ) : (
              <Camera size={18} strokeWidth={1.75} className="text-ink-900" />
            )}
          </div>
          <span className="text-body font-medium text-ink-900">
            {uploading ? 'Uploading…' : 'Add a photo'}
          </span>
          <span className="text-caption text-muted">Drop or tap. JPG / PNG / WebP / HEIC.</span>
          <span className="text-caption text-muted inline-flex items-center gap-1.5">
            <Upload size={12} strokeWidth={1.75} />
            Up to 10 MB
          </span>
        </label>
      )}

      <input
        ref={inputRef}
        id="cairn-photo"
        type="file"
        accept={ACCEPTED}
        className="sr-only"
        onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
      />

      {error && <span className="text-caption text-signal-600">{error}</span>}
    </div>
  );
}
