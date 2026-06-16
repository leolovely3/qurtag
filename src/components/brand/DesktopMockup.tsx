import {
  Home as HomeIcon,
  Package,
  Tag as TagIcon,
  Inbox,
  Plane,
  Settings,
  MessageCircle,
  MapPin,
  Lock,
  ArrowLeft,
  ArrowRight,
  RotateCcw,
  LogOut,
} from 'lucide-react';
import { cn } from '@/lib/cn';

interface DesktopMockupProps {
  className?: string;
}

/**
 * QurTag app inside a browser window. Used in marketing hero behind
 * the phone mockup. Communicates: this is a web app you can also use on
 * any laptop. No native install required.
 */
export function DesktopMockup({ className }: DesktopMockupProps) {
  return (
    <div className={cn('relative w-full', className)}>
      {/* Soft ambient halo behind */}
      <div className="absolute -inset-12 bg-signal-glow pointer-events-none" aria-hidden />

      {/* Browser window */}
      <div className="relative rounded-modal bg-canvas shadow-device ring-1 ring-ink-200/60 overflow-hidden">
        {/* Browser top chrome */}
        <div className="bg-ink-50 border-b border-hairline">
          {/* Title bar with traffic lights */}
          <div className="h-7 flex items-center px-4">
            <div className="flex gap-1.5">
              <span className="size-2.5 rounded-full bg-signal-500/70" />
              <span className="size-2.5 rounded-full bg-ink-200" />
              <span className="size-2.5 rounded-full bg-verdigris-300" />
            </div>
          </div>
          {/* Tab strip */}
          <div className="flex items-end gap-1 px-3 -mb-px">
            <div className="rounded-t-[8px] bg-canvas border-t border-x border-hairline px-3 py-1.5 text-[10px] font-medium text-ink-900 inline-flex items-center gap-1.5 max-w-[180px]">
              <span className="size-2.5 rounded-sm bg-ink-900 inline-block grid place-items-center">
                <span className="text-[7px] font-bold text-canvas leading-none">C</span>
              </span>
              <span className="truncate">QurTag. Inbox</span>
            </div>
            <div className="flex-1" />
          </div>
        </div>

        {/* URL bar */}
        <div className="bg-canvas border-b border-hairline px-3 py-2 flex items-center gap-2">
          <div className="flex items-center gap-1 text-muted">
            <ArrowLeft size={11} strokeWidth={2} />
            <ArrowRight size={11} strokeWidth={2} className="opacity-40" />
            <RotateCcw size={10} strokeWidth={2} />
          </div>
          <div className="flex-1 h-5 rounded-pill bg-ink-50 px-2.5 flex items-center gap-1.5">
            <Lock size={9} strokeWidth={1.75} className="text-verdigris-700" />
            <span className="text-[10px] text-ink-700 font-mono truncate">
              app.qurtag.com/app/inbox
            </span>
          </div>
        </div>

        {/* App body */}
        <div className="flex">
          {/* Left rail. Matches the real AppLayout */}
          <aside className="w-40 border-r border-hairline bg-paper py-cairn-3 px-2 flex flex-col">
            <div className="px-3 pb-2 border-b border-hairline mb-2">
              <span className="font-display font-semibold text-h6 tracking-[-0.011em] text-ink-900">
                QurTag
              </span>
            </div>
            <nav className="flex flex-col gap-0.5">
              {[
                { icon: HomeIcon, label: 'Home' },
                { icon: Package, label: 'Items' },
                { icon: TagIcon, label: 'Tags' },
                { icon: Inbox, label: 'Inbox', active: true, badge: 1 },
                { icon: Plane, label: 'Trips' },
                { icon: Settings, label: 'Settings' },
              ].map((item) => (
                <div
                  key={item.label}
                  className={cn(
                    'flex items-center gap-2.5 px-3 h-7 rounded-card text-[11px] font-medium',
                    item.active ? 'bg-ink-900 text-canvas' : 'text-muted',
                  )}
                >
                  <item.icon size={12} strokeWidth={1.75} aria-hidden />
                  <span className="flex-1">{item.label}</span>
                  {item.badge && (
                    <span className="inline-flex items-center justify-center min-w-[14px] h-3.5 px-1 rounded-pill bg-signal-500 text-canvas text-[8px] font-semibold">
                      {item.badge}
                    </span>
                  )}
                </div>
              ))}
            </nav>

            {/* Bottom of rail: Free plan upsell + Sign out. Matches real AppLayout */}
            <div className="mt-auto pt-cairn-2 flex flex-col gap-1.5">
              <div className="rounded-card bg-canvas border border-hairline px-2 py-1.5 flex flex-col gap-1">
                <span className="text-[7px] uppercase tracking-[0.14em] text-muted font-medium">
                  Free plan
                </span>
                <p className="text-[9px] text-ink-700 leading-tight">
                  Upgrade for translation, trip mode, and 0% fees.
                </p>
                <span className="text-[9px] font-medium text-ink-900">See plans →</span>
              </div>
              <div className="flex items-center gap-2.5 px-3 h-7 rounded-card text-[11px] font-medium text-muted">
                <LogOut size={12} strokeWidth={1.75} aria-hidden />
                <span>Sign out</span>
              </div>
            </div>
          </aside>

          {/* Main content. Inbox view */}
          <main className="flex-1 p-cairn-3 flex flex-col gap-cairn-2 min-h-[260px]">
            <div className="flex items-baseline justify-between">
              <div>
                <span className="text-[9px] uppercase tracking-[0.14em] text-muted font-medium">
                  Inbox
                </span>
                <h3 className="font-display font-semibold text-[15px] tracking-[-0.014em] text-ink-900 mt-0.5">
                  1 new note to read.
                </h3>
              </div>
              <span className="text-[10px] text-muted">Wed 14:08</span>
            </div>

            {/* Thread preview row. Unread */}
            <div className="rounded-card border border-hairline-strong bg-canvas p-2.5 flex items-start gap-2.5">
              <div className="size-9 rounded-card bg-ink-50 grid place-items-center shrink-0">
                <Package size={14} strokeWidth={1.5} className="text-ink-900" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[11px] font-semibold text-ink-900">Rimowa Original Cabin</span>
                  <span className="text-[9px] text-muted shrink-0">just now</span>
                </div>
                <p className="text-[10px] text-ink-900 truncate mt-0.5">
                  They wrote: "I have your bag. I'm at the Memmo Alfama. Leave it at the front desk?"
                </p>
                <div className="flex items-center gap-2 mt-1 text-[9px] text-muted">
                  <span className="inline-flex items-center gap-0.5 text-signal-700">
                    <MapPin size={9} strokeWidth={1.75} /> Armed
                  </span>
                  <span className="inline-flex items-center gap-0.5 rounded-pill bg-signal-500 text-canvas px-1 py-px font-semibold uppercase tracking-wider">
                    1 new
                  </span>
                </div>
              </div>
            </div>

            {/* Thread preview row. Read */}
            <div className="rounded-card border border-hairline bg-canvas p-2.5 flex items-start gap-2.5">
              <div className="size-9 rounded-card bg-ink-50 grid place-items-center shrink-0">
                <MessageCircle size={14} strokeWidth={1.5} className="text-muted" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[11px] font-medium text-ink-700">MacBook Pro</span>
                  <span className="text-[9px] text-muted shrink-0">2h ago</span>
                </div>
                <p className="text-[10px] text-muted truncate mt-0.5">
                  You wrote: "Thank you. I'm grabbing it on the way back."
                </p>
              </div>
            </div>

            {/* Privacy strip */}
            <div className="mt-auto flex items-center gap-1.5 text-[9px] text-muted px-1">
              <Lock size={9} strokeWidth={1.75} />
              No phone, email, or address exchanged either direction.
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
