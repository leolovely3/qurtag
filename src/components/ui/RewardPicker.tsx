import { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/cn';

interface RewardPickerProps {
  valueCents: number | null;
  onChange: (cents: number | null) => void;
  disabled?: boolean;
}

const PRESETS = [
  { label: 'None', cents: 0 },
  { label: '$25', cents: 2500 },
  { label: '$50', cents: 5000 },
  { label: '$100', cents: 10000 },
];

export function RewardPicker({ valueCents, onChange, disabled }: RewardPickerProps) {
  const presetMatch = PRESETS.find((p) => p.cents === (valueCents ?? 0));
  const initialCustom = !presetMatch && valueCents != null ? String(valueCents / 100) : '';
  const [custom, setCustom] = useState(initialCustom);

  useEffect(() => {
    const v = Number(custom);
    if (!custom || Number.isNaN(v) || v <= 0) return;
    const cents = Math.round(v * 100);
    if (cents !== (valueCents ?? 0)) onChange(cents);
    // We intentionally don't react to valueCents changes here. That would fight presets.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [custom]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <ShieldCheck size={14} strokeWidth={1.75} className="text-muted" />
        <span className="text-caption text-muted">
          Held in escrow. Released to the finder when the item is back.
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => {
          const active = (valueCents ?? 0) === p.cents;
          return (
            <button
              key={p.label}
              type="button"
              disabled={disabled}
              onClick={() => {
                setCustom('');
                onChange(p.cents === 0 ? null : p.cents);
              }}
              className={cn(
                'h-10 px-4 rounded-pill text-caption font-medium border transition-colors duration-qurtag ease-qurtag',
                active
                  ? 'bg-ink-900 text-canvas border-ink-900'
                  : 'bg-canvas text-ink-900 border-hairline-strong hover:border-ink-900',
                disabled && 'opacity-50 cursor-not-allowed',
              )}
            >
              {p.label}
            </button>
          );
        })}
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-caption text-muted pointer-events-none">
            $
          </span>
          <input
            type="text"
            inputMode="decimal"
            placeholder="Custom"
            disabled={disabled}
            value={custom}
            onChange={(e) => setCustom(e.target.value.replace(/[^0-9.]/g, ''))}
            className={cn(
              'h-10 w-28 pl-7 pr-3 rounded-pill bg-canvas border text-caption text-ink-900 placeholder:text-muted',
              'border-hairline-strong focus:outline-none focus:border-ink-900 transition-colors duration-qurtag',
              custom && 'border-ink-900',
              disabled && 'opacity-50 cursor-not-allowed',
            )}
          />
        </div>
      </div>
    </div>
  );
}
