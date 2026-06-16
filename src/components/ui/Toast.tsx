import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { cn } from '@/lib/cn';

export type ToastKind = 'success' | 'error' | 'info';

interface Toast {
  id: string;
  kind: ToastKind;
  title: string;
  body?: string;
  duration: number;
}

interface ToastContextValue {
  show: (input: { kind?: ToastKind; title: string; body?: string; duration?: number }) => string;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let counter = 0;
function nextId(): string {
  counter += 1;
  return `toast-${counter}`;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const show = useCallback<ToastContextValue['show']>(
    ({ kind = 'info', title, body, duration = 4500 }) => {
      const id = nextId();
      setToasts((t) => [...t, { id, kind, title, body, duration }]);
      return id;
    },
    [],
  );

  return (
    <ToastContext.Provider value={{ show, dismiss }}>
      {children}
      <Toaster toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}

interface ToasterProps {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}

function Toaster({ toasts, onDismiss }: ToasterProps) {
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div
      aria-live="polite"
      className="fixed bottom-cairn-3 right-cairn-3 z-50 flex flex-col gap-2 pointer-events-none max-w-[380px] w-[calc(100vw-2rem)]"
    >
      {toasts.map((t) => (
        <ToastCard key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>,
    document.body,
  );
}

function ToastCard({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  useEffect(() => {
    if (toast.duration <= 0) return;
    const t = setTimeout(() => onDismiss(toast.id), toast.duration);
    return () => clearTimeout(t);
  }, [toast, onDismiss]);

  const Icon = toast.kind === 'success' ? CheckCircle2 : toast.kind === 'error' ? AlertCircle : Info;
  const iconClass =
    toast.kind === 'success'
      ? 'text-verdigris-600'
      : toast.kind === 'error'
        ? 'text-signal-600'
        : 'text-ink-700';

  return (
    <div
      role={toast.kind === 'error' ? 'alert' : 'status'}
      className={cn(
        'pointer-events-auto rounded-modal bg-canvas border border-hairline shadow-elevated p-cairn-3',
        'flex items-start gap-3 animate-cairn-fade-up',
      )}
    >
      <Icon size={18} strokeWidth={1.75} className={cn('mt-0.5 shrink-0', iconClass)} />
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <p className="text-body font-medium text-ink-900 text-pretty">{toast.title}</p>
        {toast.body && (
          <p className="text-caption text-muted text-pretty">{toast.body}</p>
        )}
      </div>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss"
        className="size-6 grid place-items-center rounded-pill text-muted hover:bg-ink-50 transition-colors duration-cairn -mr-1 -mt-0.5 shrink-0"
      >
        <X size={12} strokeWidth={2} />
      </button>
    </div>
  );
}
