import React, { useState } from 'react';
import {
  Box, Typography, Button, Alert, Paper, TextField, MenuItem,
  Chip, Divider, CircularProgress, Stack
} from '@mui/material';
import { Building2, Copy, Check, LogOut } from 'lucide-react';
import { useAuth } from './AuthContext';

const BusinessSetup = () => {
  const { createBusiness, logout, currentUser } = useAuth();
  const [name, setName] = useState('');
  const [businessType, setBusinessType] = useState('general');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [businessCode, setBusinessCode] = useState('');
  const [copied, setCopied] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) { setError('Business name is required.'); return; }
    setLoading(true);
    setError('');
    const result = await createBusiness(name.trim(), businessType);
    if (result.success) {
      setBusinessCode(result.businessCode);
      setDone(true);
    } else {
      setError(result.error || 'Failed to create business. Please try again.');
    }
    setLoading(false);
  };

  const copyCode = () => {
    navigator.clipboard.writeText(businessCode).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'background.default',
        p: 2,
      }}
    >
      <Paper
        elevation={6}
        sx={{
          maxWidth: 480,
          width: '100%',
          p: { xs: 3, sm: 5 },
          borderRadius: 4,
        }}
      >
        {!done ? (
          <>
            {/* Header */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
              <Box sx={{
                width: 44, height: 44, borderRadius: 2,
                bgcolor: 'primary.main',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <Building2 size={22} color="white" />
              </Box>
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 800, lineHeight: 1.2 }}>
                  Set Up Your Business
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Logged in as {currentUser?.email}
                </Typography>
              </Box>
            </Box>

            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Create your business profile to get started. A unique Business Code will be generated
              that your staff can use to log in.
            </Typography>

            {error && (
              <Alert severity="error" sx={{ mb: 2.5, borderRadius: 2 }} onClose={() => setError('')}>
                {error}
              </Alert>
            )}

            <Stack spacing={2.5}>
              <TextField
                label="Business Name *"
                fullWidth
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Sunrise Traders, Everest Opticals"
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
                autoFocus
              />

              <TextField
                select
                label="Business Type"
                fullWidth
                value={businessType}
                onChange={e => setBusinessType(e.target.value)}
              >
                <MenuItem value="general">General Business</MenuItem>
                <MenuItem value="opticals">Opticals / Eye Care</MenuItem>
              </TextField>

              <Stack direction="row" spacing={1.5} justifyContent="flex-end">
                <Button
                  variant="outlined"
                  startIcon={<LogOut size={16} />}
                  onClick={logout}
                  disabled={loading}
                >
                  Sign Out
                </Button>
                <Button
                  variant="contained"
                  onClick={handleCreate}
                  disabled={loading || !name.trim()}
                  startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <Building2 size={16} />}
                >
                  {loading ? 'Creating…' : 'Create Business'}
                </Button>
              </Stack>
            </Stack>
          </>
        ) : (
          <>
            {/* Success screen */}
            <Box sx={{ textAlign: 'center', mb: 3 }}>
              <Box sx={{
                width: 64, height: 64, borderRadius: '50%',
                bgcolor: 'success.light', mx: 'auto', mb: 2,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Check size={32} color="white" />
              </Box>
              <Typography variant="h6" sx={{ fontWeight: 800 }}>
                Business Created!
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                Your business is ready. Share the code below with your staff so they can log in.
              </Typography>
            </Box>

            <Divider sx={{ mb: 3 }} />

            <Box sx={{ textAlign: 'center', mb: 3 }}>
              <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 1 }}>
                Business Code
              </Typography>
              <Box sx={{
                mt: 1.5, mb: 1.5,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1.5,
              }}>
                <Typography
                  variant="h3"
                  sx={{
                    fontWeight: 900,
                    letterSpacing: 8,
                    color: 'primary.main',
                    fontFamily: 'monospace',
                  }}
                >
                  {businessCode}
                </Typography>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={copied ? <Check size={14} /> : <Copy size={14} />}
                  onClick={copyCode}
                  sx={{ minWidth: 80, borderRadius: 2 }}
                  color={copied ? 'success' : 'primary'}
                >
                  {copied ? 'Copied' : 'Copy'}
                </Button>
              </Box>
              <Alert severity="info" sx={{ borderRadius: 2, textAlign: 'left', fontSize: '0.78rem' }}>
                Keep this code safe. Staff use it along with their username and password to log in.
                You can always find it in <strong>Settings</strong>.
              </Alert>
            </Box>

            <Button
              variant="contained"
              fullWidth
              size="large"
              sx={{ borderRadius: 3, py: 1.5 }}
              onClick={() => window.location.reload()}
            >
              Enter App
            </Button>
          </>
        )}
      </Paper>
    </Box>
  );
};

export default BusinessSetup;
