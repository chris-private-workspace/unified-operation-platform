import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { initMsal } from './lib/auth/msal';
import './index.css';

// msal-browser v3+ requires initialize() + handleRedirectPromise() before any other API
// (ADR-0003). Init failure must not block the shell — dev-bypass still needs a usable app.
void initMsal()
  .catch((err) =>
    console.error('MSAL init failed; continuing (dev-bypass path)', err),
  )
  .finally(() => {
    ReactDOM.createRoot(document.getElementById('root')!).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    );
  });
