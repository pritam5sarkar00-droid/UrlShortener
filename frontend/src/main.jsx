import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { ThemeModeProvider } from './context/ThemeModeContext.jsx';
import './index.css';

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

// GoogleOAuthProvider throws if given an empty clientId, so only wrap with
// it when one is actually configured - Google login buttons just won't
// render otherwise (see GoogleLoginButton.jsx), everything else still works.
function Providers({ children }) {
  return googleClientId ? (
    <GoogleOAuthProvider clientId={googleClientId}>{children}</GoogleOAuthProvider>
  ) : (
    children
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeModeProvider>
      <BrowserRouter>
        <Providers>
          <AuthProvider>
            <App />
          </AuthProvider>
        </Providers>
      </BrowserRouter>
    </ThemeModeProvider>
  </StrictMode>
);
