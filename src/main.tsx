import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import './study/clean.css';
import './study/refinement.css';
import './study/profile.css';
import './study/themes.css';
import './study/warm-shell.css';
import './features/welcome/welcome.css';
import './study/hellenic.css';
import './study/usability.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
