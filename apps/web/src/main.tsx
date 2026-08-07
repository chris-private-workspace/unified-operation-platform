import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { completeSsoRedirect } from './lib/auth/sso';
import './index.css';

// A sign-in returning from Entra lands on '/', which is a guarded route — so the
// code has to be spent BEFORE the router runs, or the auth gate bounces the user
// to /login with it unused (ADR-0028). No-op on an ordinary page load.
//
// Never blocks the shell: completeSsoRedirect resolves either way, and .catch is
// the backstop so an unexpected throw cannot leave a blank page.
void completeSsoRedirect()
  .catch((err) => console.error('SSO redirect handling failed', err))
  .finally(() => {
    ReactDOM.createRoot(document.getElementById('root')!).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    );
  });
