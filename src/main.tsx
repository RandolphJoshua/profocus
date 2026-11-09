import './features.css';
import './routines.css';
import './coach.css';
import './aiPlan.css';
import './motion.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { demoState } from './lib/demo';
import { todayKey } from './lib/date';
import { STORAGE_KEY } from './lib/storage';
import { AuthProvider } from './state/auth';
import { StoreProvider } from './state/store';
import { SyncProvider } from './state/sync';
import { TimerProvider } from './state/timer';
import './styles.css';
import { CalendarProvider } from './state/calendar';
import { CoachProvider } from './state/coach';

const root = document.getElementById('root');
if (!root) throw new Error('#root element missing from index.html');

// ?demo=1 starts from sample data when nothing is saved yet (it persists on the first change).
const wantsDemo = (() => {
  try {
    return window.location.search.includes('demo=1') && !localStorage.getItem(STORAGE_KEY);
  } catch {
    return false;
  }
})();

createRoot(root).render(
  <StrictMode>
    <StoreProvider initial={wantsDemo ? demoState(todayKey()) : undefined}>
      <AuthProvider>
        <SyncProvider>
          <CalendarProvider>
            <CoachProvider>
              <TimerProvider>
                <App />
              </TimerProvider>
            </CoachProvider>
          </CalendarProvider>
        </SyncProvider>
      </AuthProvider>
    </StoreProvider>
  </StrictMode>,
);
