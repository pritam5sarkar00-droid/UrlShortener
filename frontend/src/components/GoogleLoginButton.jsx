import GoogleIcon from "@mui/icons-material/Google";
import { Button, Divider, Typography, Box } from "@mui/material";
import { useGoogleLogin } from "@react-oauth/google";
import { useAuth } from "../context/AuthContext.jsx";

export function GoogleLoginButton({ onSuccess, onError }) {
  const { loginWithGoogle } = useAuth();

  const login = useGoogleLogin({
    flow: "implicit",
    onSuccess: async (tokenResponse) => {
      try {
        await loginWithGoogle(tokenResponse.access_token);
        onSuccess?.();
      } catch (err) {
        onError?.(err.message);
      }
    },
    onError: () => onError?.("Google login failed"),
  });

  return (
    <Box sx={{ mt: 2 }}>
      <Divider sx={{ mb: 3 }}>
        <Typography variant="caption">
          OR
        </Typography>
      </Divider>

      <Button
        fullWidth
        variant="outlined"
        size="large"
        startIcon={<GoogleIcon />}
        onClick={() => login()}
        sx={{
          py: 1.4,
          borderRadius: 3,
          textTransform: "none",
          fontSize: 16,
          fontWeight: 600,
        }}
      >
        Continue with Google
      </Button>
    </Box>
  );
}