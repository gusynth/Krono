import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { CleanStudy } from './CleanStudy';
import './clean.css';
import './refinement.css';
import './profile.css';
import './themes.css';
import './warm-shell.css';
import '../features/welcome/welcome.css';
import './hellenic.css';
import './usability.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CleanStudy />
  </StrictMode>,
);
