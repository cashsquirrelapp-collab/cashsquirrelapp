import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import KineticLanding from './features/marketing/kinetic/KineticLanding';
createRoot(document.getElementById('root')!).render(<React.StrictMode><KineticLanding loginHref="/login" /></React.StrictMode>);
