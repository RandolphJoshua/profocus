import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AiPlanDialog } from '../components/AiPlanDialog';
import { takeResume } from './aiPlanResume';

export interface AiPlanOpenOptions {
  prompt?: string;
  /** Send the prompt as soon as the dialog opens. */
  run?: boolean;
}

export interface AiPlanApi {
  open: (opts?: AiPlanOpenOptions) => void;
  /** Block ids an AI Undo is about to remove, so the generic "Block removed" toast stays quiet for them. */
  muteBlockToast: (ids: string[]) => void;
  isBlockToastMuted: (id: string) => boolean;
}

const AiPlanContext = createContext<AiPlanApi>({ open: () => {}, muteBlockToast: () => {}, isBlockToastMuted: () => false });
export const useAiPlan = (): AiPlanApi => useContext(AiPlanContext);

/** Owns the "Plan with AI" dialog so Today, Week and the palette can open it the same way. */
export function AiPlanProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<(AiPlanOpenOptions & { key: number }) | null>(null);
  const muted = useRef(new Set<string>());
  const open = useCallback((opts: AiPlanOpenOptions = {}) => setRequest({ ...opts, key: Date.now() }), []);
  const muteBlockToast = useCallback((ids: string[]) => ids.forEach((id) => muted.current.add(id)), []);
  const isBlockToastMuted = useCallback((id: string) => muted.current.has(id), []);
  const value = useMemo(() => ({ open, muteBlockToast, isBlockToastMuted }), [open, muteBlockToast, isBlockToastMuted]);
  // After a reload that picked up a new deploy, reopen the request and run it.
  useEffect(() => {
    const prompt = takeResume();
    if (prompt) open({ prompt, run: true });
  }, [open]);
  return (
    <AiPlanContext.Provider value={value}>
      {children}
      {request && <AiPlanDialog key={request.key} initialPrompt={request.prompt} autoRun={request.run} onClose={() => setRequest(null)} />}
    </AiPlanContext.Provider>
  );
}
