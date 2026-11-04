import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { demoState } from './lib/demo';
import { todayKey } from './lib/date';
import { STORAGE_KEY } from './lib/storage';
import { StoreProvider } from './state/store';
import { TimerProvider } from './state/timer';
import './styles.css';

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
      <TimerProvider>
        <App />
      </TimerProvider>
    </StoreProvider>
  </StrictMode>,
);
