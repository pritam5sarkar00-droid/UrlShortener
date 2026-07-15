import { GoogleLogin } from '@react-oauth/google';
import { Divider, Typography, Box } from '@mui/material';
import { useAuth } from '../context/AuthContext.jsx';
import { useThemeMode } from '../context/ThemeModeContext.jsx';

export function GoogleLoginButton({ onSuccess, onError }) {
  const { loginWithGoogle } = useAuth();
  const { mode } = useThemeMode();
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  if (!googleClientId) return null;

  return (
    <Box sx={{ mt: 1 }}>
      <Divider sx={{ my: 2 }}>
        <Typography variant="caption" color="text.secondary">
          OR
        </Typography>
      </Divider>
      <Box sx={{ display: 'flex', justifyContent: 'center' }}>
        <GoogleLogin
          theme={mode === 'dark' ? 'filled_black' : 'outline'}
          onSuccess={async (credentialResponse) => {
            try {
              await loginWithGoogle(credentialResponse.credential);
              onSuccess?.();
            } catch (err) {
              onError?.(err.message);
            }
          }}
          onError={() => onError?.('Google sign-in failed - please try again.')}
        />
      </Box>
    </Box>
  );
}
