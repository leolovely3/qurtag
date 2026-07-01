import { MapPin, Lock, Package, Plus, Laptop, Headphones } from 'lucide-react';
import { cn } from '@/lib/cn';

interface PhoneMockupProps {
  className?: string;
}

/**
 * QurTag /app home dashboard, rendered inside a device frame.
 * Faithful to the real AppHome surface. Same greeting, same "Your items"
 * heading + Add link, same item-card layout (tier eyebrow + armed/idle pill
 * + name + value/location row).
 */
export function PhoneMockup({ className }: PhoneMockupProps) {
  return (
    <div
      className={cn(
        'relative mx-auto',
        'w-[260px] sm:w-[280px] lg:w-[300px]',
        className,
      )}
    >
      {/* Soft ambient halo */}
      <div className="absolute -inset-12 bg-signal-glow pointer-events-none" aria-hidden />

      {/* Device frame */}
      <div className="relative aspect-[9/19.5] rounded-device bg-ink-950 p-[6px] shadow-device ring-1 ring-ink-800">
        {/* Inner bezel */}
        <div className="relative h-full w-full rounded-[2.15rem] bg-canvas overflow-hidden ring-1 ring-ink-200/60">
          {/* Status bar */}
          <div className="flex items-center justify-between px-6 pt-3 text-[10px] font-medium text-ink-900">
            <span>9:41</span>
            <span className="flex items-center gap-1">
              <span className="size-1 rounded-full bg-ink-900" />
              <span className="size-1 rounded-full bg-ink-900" />
              <span className="size-1 rounded-full bg-ink-900" />
            </span>
          </div>

          {/* Notch */}
          <div className="absolute top-2 left-1/2 -translate-x-1/2 h-5 w-24 rounded-full bg-ink-950" aria-hidden />

          {/* App content. Pure /app home dashboard */}
          <div className="px-4 pt-6 pb-6 flex flex-col gap-3">
            {/* Greeting + H1 */}
            <div className="flex flex-col gap-0.5 mt-2">
              <span className="text-[9px] uppercase tracking-[0.14em] text-muted font-medium">
                Good afternoon
              </span>
              <h3 className="font-display text-[18px] tracking-[-0.022em] font-semibold text-ink-900 leading-tight">
                Everything is where it should be.
              </h3>
            </div>

            {/* "Your items" + Add */}
            <div className="flex items-end justify-between mt-1">
              <h4 className="font-display font-semibold text-[12px] tracking-[-0.014em] text-ink-900">
                Your items
              </h4>
              <span className="text-[9px] text-muted inline-flex items-center gap-0.5">
                <Plus size={9} strokeWidth={1.75} />
                Add item
              </span>
            </div>

            {/* Item 1. Rimowa, armed */}
            <article className="rounded-2xl border border-hairline bg-canvas p-3 flex gap-2.5">
              <div className="size-12 rounded-card bg-ink-50 grid place-items-center shrink-0">
                <Package size={16} strokeWidth={1.5} className="text-ink-900" />
              </div>
              <div className="flex-1 min-w-0 flex flex-col gap-1">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[8px] uppercase tracking-[0.14em] text-muted font-medium">
                    Signature
                  </span>
                  <span className="inline-flex items-center gap-0.5 rounded-pill bg-signal-50 text-signal-700 px-1.5 py-px text-[8px] font-medium">
                    <span className="size-1 rounded-full bg-signal-500 animate-qurtag-pulse" />
                    Armed
                  </span>
                </div>
                <h5 className="font-display text-[12px] font-semibold text-ink-900 tracking-[-0.014em] truncate">
                  Rimowa Original Cabin
                </h5>
                <div className="flex items-center gap-2 text-[9px] text-muted mt-auto">
                  <span className="inline-flex items-center gap-0.5">
                    <Lock size={8} strokeWidth={1.75} /> $1,200
                  </span>
                  <span className="inline-flex items-center gap-0.5">
                    <MapPin size={8} strokeWidth={1.75} /> LHR
                  </span>
                </div>
              </div>
            </article>

            {/* Item 2. MacBook, idle */}
            <article className="rounded-2xl border border-hairline bg-canvas p-3 flex gap-2.5">
              <div className="size-12 rounded-card bg-ink-50 grid place-items-center shrink-0">
                <Laptop size={16} strokeWidth={1.5} className="text-ink-900" />
              </div>
              <div className="flex-1 min-w-0 flex flex-col gap-1">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[8px] uppercase tracking-[0.14em] text-muted font-medium">
                    Sticker
                  </span>
                  <span className="inline-flex items-center gap-0.5 rounded-pill bg-ink-50 text-muted px-1.5 py-px text-[8px] font-medium">
                    <span className="size-1 rounded-full bg-ink-300" />
                    Idle
                  </span>
                </div>
                <h5 className="font-display text-[12px] font-semibold text-ink-900 tracking-[-0.014em] truncate">
                  MacBook Pro
                </h5>
                <div className="flex items-center gap-2 text-[9px] text-muted mt-auto">
                  <span className="inline-flex items-center gap-0.5">
                    <Lock size={8} strokeWidth={1.75} /> $2,400
                  </span>
                  <span className="inline-flex items-center gap-0.5">
                    <MapPin size={8} strokeWidth={1.75} /> Home
                  </span>
                </div>
              </div>
            </article>

            {/* Item 3. AirPods, idle */}
            <article className="rounded-2xl border border-hairline bg-canvas p-3 flex gap-2.5">
              <div className="size-12 rounded-card bg-ink-50 grid place-items-center shrink-0">
                <Headphones size={16} strokeWidth={1.5} className="text-ink-900" />
              </div>
              <div className="flex-1 min-w-0 flex flex-col gap-1">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[8px] uppercase tracking-[0.14em] text-muted font-medium">
                    Sticker
                  </span>
                  <span className="inline-flex items-center gap-0.5 rounded-pill bg-ink-50 text-muted px-1.5 py-px text-[8px] font-medium">
                    <span className="size-1 rounded-full bg-ink-300" />
                    Idle
                  </span>
                </div>
                <h5 className="font-display text-[12px] font-semibold text-ink-900 tracking-[-0.014em] truncate">
                  AirPods Max
                </h5>
                <div className="flex items-center gap-2 text-[9px] text-muted mt-auto">
                  <span className="inline-flex items-center gap-0.5">
                    <Lock size={8} strokeWidth={1.75} /> $549
                  </span>
                  <span className="inline-flex items-center gap-0.5">
                    <MapPin size={8} strokeWidth={1.75} /> Home
                  </span>
                </div>
              </div>
            </article>
          </div>

          {/* Home indicator */}
          <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 h-1 w-24 rounded-full bg-ink-900/30" aria-hidden />
        </div>
      </div>
    </div>
  );
}
