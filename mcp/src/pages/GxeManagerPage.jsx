import React from 'react';
import { Box, Typography } from '@mui/material';
import GxeManagerMonitor from '../components/GxeManager/GxeManagerMonitor';

/**
 * GxeManagerPage — wrapper page for the GxeManager Monitor dashboard.
 * Mounted at /gxe-manager route.
 */
const GxeManagerPage = () => {
  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <GxeManagerMonitor />
    </Box>
  );
};

export default GxeManagerPage;
