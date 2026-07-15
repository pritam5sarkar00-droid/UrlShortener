import { Container, Typography, Box } from '@mui/material';
import { CreateLinkForm } from '../components/CreateLinkForm.jsx';

export function HomePage() {
  return (
    <Container maxWidth="sm" sx={{ mt: { xs: 6, sm: 10 } }}>
      <Box sx={{ textAlign: 'center', mb: 5 }}>
        <Typography
          variant="overline"
          sx={{ color: 'primary.main', fontWeight: 700, letterSpacing: '0.12em' }}
        >
          Free · No signup required
        </Typography>
        <Typography variant="h4" sx={{ fontWeight: 700, mb: 1, letterSpacing: '-0.02em' }}>
          Shorten a link
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Sign up if you want custom aliases, a dashboard, and live click tracking.
        </Typography>
      </Box>
      <CreateLinkForm />
    </Container>
  );
}
