import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/global.css';
import { registerApps } from './lib/appRegistry';
import { APPS } from './apps';
import App from './App';
import { gsap } from 'gsap';

// If a frame is slow (an app mounting), continue the animation from where it was instead of jumping ahead.
gsap.ticker.lagSmoothing(80, 16);

registerApps(APPS);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
