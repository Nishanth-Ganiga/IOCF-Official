import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MotionConfig } from 'framer-motion';
import App from './App';
import { initData } from './data/store';
import './index.css';

// Load the live IOCF dataset first so every page renders with real data.
void initData().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <MotionConfig reducedMotion="user">
        <App />
      </MotionConfig>
    </StrictMode>,
  );
});
