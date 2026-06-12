import React, { useState } from 'react';
import { Box, Typography, Button, IconButton, Paper, keyframes } from '@mui/material';
import { Settings as SettingsIcon, X, ArrowRight, Sparkles } from 'lucide-react';
import { useBusiness } from './BusinessContext';
import { useData } from './DataContext';
import { useAuth } from './AuthContext';
import { useTabs } from './TabsContext';

// Gentle horizontal bounce to draw the eye toward the "Set up" action.
const nudge = keyframes`
  0%, 100% { transform: translateX(0); }
  50% { transform: translateX(6px); }
`;

// First-run onboarding hint. Business setup is NOT mandatory — the user can use
// the app right away with the default "My Business" name. This dismissible card
// points them to Settings where they can rename and fill in business details.
const BusinessSetupDialog = () => {
  const { currentBusiness } = useBusiness();
  const { updateBusiness } = useData();
  const { staffSession } = useAuth();
  const { openTab } = useTabs();
  const [dismissed, setDismissed] = useState(false);

  // Never show for staff sessions; only show on first run for a fresh business.
  if (staffSession || !currentBusiness?.needsSetup || dismissed) return null;

  // Clear the first-run flag so the hint never reappears for this business.
  const clearFlag = () => {
    try { updateBusiness(currentBusiness.id, { needsSetup: false }); } catch { /* ignore */ }
  };

  const goToSettings = () => {
    clearFlag();
    setDismissed(true);
    openTab('/settings', 'Settings');
  };

  const dismiss = () => {
    clearFlag();
    setDismissed(true);
  };

  return (
    <Paper
      elevation={8}
      sx={{
        position: 'fixed',
        bottom: { xs: 76, sm: 24 },
        right: { xs: 12, sm: 24 },
        left: { xs: 12, sm: 'auto' },
        zIndex: (t) => t.zIndex.snackbar + 1,
        maxWidth: { sm: 380 },
        p: 2,
        borderRadius: 3,
        border: '1px solid',
        borderColor: 'primary.main',
        boxShadow: '0 16px 48px rgba(0,0,0,0.22)',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 1.5,
      }}
    >
      <Box sx={{ p: 1, borderRadius: 2, bgcolor: 'primary.main', color: '#fff', display: 'flex', flexShrink: 0 }}>
        <Sparkles size={20} />
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontWeight: 800, fontSize: '0.95rem', lineHeight: 1.25 }}>
          You&apos;re all set — start using the app!
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, mb: 1.25 }}>
          Your business is named <strong>“{currentBusiness?.name || 'My Business'}”</strong>. You can change the name,
          add your logo, GST and other details any time in <strong>Settings</strong>.
        </Typography>
        <Button
          variant="contained"
          size="small"
          onClick={goToSettings}
          startIcon={<SettingsIcon size={15} />}
          endIcon={<Box component="span" sx={{ display: 'inline-flex', animation: `${nudge} 1.1s ease-in-out infinite` }}><ArrowRight size={15} /></Box>}
          sx={{ fontWeight: 700, textTransform: 'none', borderRadius: 2 }}
        >
          Set up your business
        </Button>
        <Button size="small" onClick={dismiss} sx={{ ml: 1, fontWeight: 600, textTransform: 'none', color: 'text.secondary' }}>
          Maybe later
        </Button>
      </Box>
      <IconButton size="small" onClick={dismiss} sx={{ color: 'text.disabled', mt: -0.5, mr: -0.5 }}>
        <X size={16} />
      </IconButton>
    </Paper>
  );
};

export default BusinessSetupDialog;
