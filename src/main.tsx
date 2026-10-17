import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {requestPersistentStorage} from './lib/db';
import {initSync} from './lib/sync';
import './index.css';

// Verhindert, dass der Browser die lokalen Rezeptdaten bei Speicherknappheit löscht
requestPersistentStorage();
initSync();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
