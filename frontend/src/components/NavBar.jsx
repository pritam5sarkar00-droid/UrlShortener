import { AppBar, Toolbar, Typography, Button, Stack, IconButton, Box, Tooltip } from '@mui/material';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import LinkIcon from '@mui/icons-material/Link';
import LightModeRoundedIcon from '@mui/icons-material/LightModeRounded';
import DarkModeRoundedIcon from '@mui/icons-material/DarkModeRounded';
import { useAuth } from '../context/AuthContext.jsx';
import { useThemeMode } from '../context/ThemeModeContext.jsx';
import { tokens } from '../theme.js';

export function NavBar() {
  const { user, logout } = useAuth();
  const { mode, toggleMode } = useThemeMode();
  const navigate = useNavigate();
  const isDark = mode === 'dark';

  return (
    <AppBar position="static" elevation={0} sx={{ borderBottom: 1, borderColor: 'divider' }}>
      <Toolbar sx={{ maxWidth: 960, width: '100%', mx: 'auto' }}>
        <Box sx={{ position: 'relative', display: 'inline-flex', mr: 1.25 }}>
          <LinkIcon color="primary" />
          <Box
            sx={{
              position: 'absolute',
              top: -2,
              right: -2,
              width: 7,
              height: 7,
              borderRadius: '50%',
              bgcolor: tokens.amber,
              boxShadow: (t) => `0 0 0 2px ${t.palette.background.default}`,
            }}
          />
        </Box>
        <Typography
          variant="h6"
          component={RouterLink}
          to="/"
          sx={{ flexGrow: 1, textDecoration: 'none', color: 'inherit', letterSpacing: '-0.02em' }}
        >
          shorty
        </Typography>
        <Stack direction="row" spacing={0.5} alignItems="center">
          <Tooltip title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}>
            <IconButton onClick={toggleMode} size="small" sx={{ mr: 0.5 }} aria-label="toggle color mode">
              {isDark ? <LightModeRoundedIcon fontSize="small" /> : <DarkModeRoundedIcon fontSize="small" />}
            </IconButton>
          </Tooltip>
          {user ? (
            <>
              <Button component={RouterLink} to="/dashboard">
                Dashboard
              </Button>
              <Button
                onClick={() => {
                  logout();
                  navigate('/');
                }}
              >
                Log out
              </Button>
            </>
          ) : (
            <>
              <Button component={RouterLink} to="/login">
                Log in
              </Button>
              <Button variant="contained" component={RouterLink} to="/register">
                Sign up
              </Button>
            </>
          )}
        </Stack>
      </Toolbar>
    </AppBar>
  );
}
