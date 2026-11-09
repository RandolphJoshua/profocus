/** A Plan with AI request carried across the reload that picks up a new deploy. */
const RESUME_KEY = 'profocus:ai-plan-resume';

export function saveResume(prompt: string): void {
  try {
    sessionStorage.setItem(RESUME_KEY, prompt);
  } catch {
    /* storage unavailable: the user retypes */
  }
}

/** Returns the saved request once, then forgets it. */
export function takeResume(): string | undefined {
  try {
    const prompt = sessionStorage.getItem(RESUME_KEY) ?? undefined;
    sessionStorage.removeItem(RESUME_KEY);
    return prompt?.trim() ? prompt : undefined;
  } catch {
    return undefined;
  }
}

const RELOADED_KEY = 'profocus:stale-reload-at';
/** One automatic reload per minute at most, so a file that is really missing cannot cause a reload loop. */
const RELOAD_GUARD_MS = 60_000;

/** True (and records the reload) when an automatic reload is allowed now. */
export function claimAutoReload(now: number = Date.now()): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOADED_KEY) ?? 0);
    if (now - last < RELOAD_GUARD_MS) return false;
    sessionStorage.setItem(RELOADED_KEY, String(now));
    return true;
  } catch {
    return false;
  }
}
