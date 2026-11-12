import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { AuthProvider } from './context/AuthContext';

import { ThemeProvider } from './theme';
import { I18nProvider } from './i18n';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      
<ThemeProvider>

  <I18nProvider>
  <App />

  </I18nProvider>
</ThemeProvider>
    </AuthProvider>
  </StrictMode>
);
