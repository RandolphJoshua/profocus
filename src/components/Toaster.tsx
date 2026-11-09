import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

export interface ToastAction {
  label: string;
  run: () => void;
}
export interface ToastOptions {
  action?: ToastAction;
}
type ToastFn = (text: string, opts?: ToastOptions) => void;

interface ToastItem {
  id: number;
  text: string;
  action?: ToastAction;
}

const MAX_TOASTS = 3;
const LIFETIME_MS = 5000;

// Outside a provider (isolated component tests) toasts are silently dropped.
const ToastContext = createContext<ToastFn>(() => {});
export const useToast = (): ToastFn => useContext(ToastContext);

function ToastCard({ item, paused, onDismiss }: { item: ToastItem; paused: boolean; onDismiss: (id: number) => void }) {
  useEffect(() => {
    if (paused) return;
    const id = window.setTimeout(() => onDismiss(item.id), LIFETIME_MS);
    return () => window.clearTimeout(id);
  }, [paused, item.id, onDismiss]);

  return (
    <div className="toast">
      <span className="toast-text">{item.text}</span>
      {item.action && (
        <>
          <span className="toast-sep" aria-hidden>·</span>
          <button
            type="button"
            className="toast-action"
            onClick={() => {
              item.action?.run();
              onDismiss(item.id);
            }}
          >
            {item.action.label}
          </button>
        </>
      )}
    </div>
  );
}

/** Bottom-centre toast host. The live region is always mounted so announcements are reliable. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const [paused, setPaused] = useState(false);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => setItems((list) => list.filter((i) => i.id !== id)), []);
  const toast = useCallback<ToastFn>((text, opts) => {
    nextId.current += 1;
    const item: ToastItem = { id: nextId.current, text, action: opts?.action };
    setItems((list) => [...list, item].slice(-MAX_TOASTS));
  }, []);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div
        className="toaster"
        role="status"
        aria-live="polite"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocus={() => setPaused(true)}
        onBlur={() => setPaused(false)}
      >
        {items.map((i) => <ToastCard key={i.id} item={i} paused={paused} onDismiss={dismiss} />)}
      </div>
    </ToastContext.Provider>
  );
}
