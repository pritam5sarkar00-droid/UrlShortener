import { useState } from 'react';
import { Container, TextField, Button, Stack, Typography, Alert, Paper, Link, Box } from '@mui/material';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { GoogleLoginButton } from '../components/GoogleLoginButton.jsx';

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await register(email, password);
      navigate('/dashboard');
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Container maxWidth="xs" sx={{ mt: 8 }}>
      <Paper elevation={0} sx={{ p: 4, borderRadius: 3 }}>
        <Typography variant="h5" sx={{ mb: 3, letterSpacing: '-0.01em' }}>
          Create an account
        </Typography>
        <Box component="form" onSubmit={handleSubmit}>
          <Stack spacing={2}>
            <TextField
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              fullWidth
              autoFocus
            />
            <TextField
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              fullWidth
              helperText="At least 8 characters"
            />
            {error && <Alert severity="error">{error}</Alert>}
            <Button type="submit" variant="contained" size="large" disabled={submitting}>
              {submitting ? 'Creating account...' : 'Sign up'}
            </Button>
            <Typography variant="body2" sx={{ textAlign: 'center' }}>
              Already have an account? <Link component={RouterLink} to="/login">Log in</Link>
            </Typography>
          </Stack>
        </Box>
        <GoogleLoginButton onSuccess={() => navigate('/dashboard')} onError={setError} />
      </Paper>
    </Container>
  );
}
