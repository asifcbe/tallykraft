import React from 'react';
import { Box, Typography, Slide } from '@mui/material';
import { WifiOff } from 'lucide-react';
import { useNetwork } from './NetworkContext';

const NetworkStatusBanner = () => {
  const { isOnline } = useNetwork();

  return (
    <Slide direction="left" in={!isOnline} mountOnEnter unmountOnExit>
      <Box
        role="alert"
        sx={{
          position: 'fixed',
          top: { xs: 'auto', sm: 76 },
          bottom: { xs: 84, sm: 'auto' },
          right: { xs: 12, sm: 20 },
          zIndex: 2000,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 1.75,
          py: 1.1,
          borderRadius: '10px',
          bgcolor: '#dc2626',
          color: '#fff',
          boxShadow: '0 8px 24px rgba(220,38,38,0.35)',
          maxWidth: 280,
        }}
      >
        <WifiOff size={18} style={{ flexShrink: 0 }} />
        <Box>
          <Typography sx={{ fontWeight: 800, fontSize: '0.8rem', lineHeight: 1.25 }}>
            No internet connection
          </Typography>
          <Typography sx={{ fontSize: '0.7rem', opacity: 0.9, lineHeight: 1.25 }}>
            Changes won't sync until you're back online.
          </Typography>
        </Box>
      </Box>
    </Slide>
  );
};

export default NetworkStatusBanner;
