import React, { useEffect, useSyncExternalStore } from 'react';
import { Box, CircularProgress } from '@mui/material';
import authClient from './authClient';
import LoginPage from './LoginPage';

/** React hook exposing the current auth snapshot { status, user } + logout. */
export function useAuth() {
  const snapshot = useSyncExternalStore(authClient.subscribe, authClient.getSnapshot, authClient.getSnapshot);
  return { ...snapshot, logout: authClient.logout };
}

let bootstrapped = false;

/**
 * Gate the whole SPA behind login. While the session is being restored a spinner
 * is shown; unauthenticated users get the LoginPage; authenticated users get the
 * app (children).
 */
export default function AuthGate({ children }) {
  const { status } = useAuth();

  useEffect(() => {
    if (!bootstrapped) {
      bootstrapped = true;
      authClient.bootstrap();
    }
  }, []);

  if (status === 'loading') {
    return (
      <Box
        sx={{
          height: '100vh',
          width: '100vw',
          display: 'grid',
          placeItems: 'center',
          bgcolor: 'background.default',
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  if (status !== 'authed') {
    return <LoginPage />;
  }

  return children;
}
