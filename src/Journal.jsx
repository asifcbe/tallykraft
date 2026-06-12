import React, { useState, useEffect } from 'react';
import {
  Box, Button, Card, CardContent, Typography, TextField, Grid,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Paper, IconButton, MenuItem, TablePagination
} from '@mui/material';
import { Plus, Trash2, ChevronLeft } from 'lucide-react';
import { useBusiness } from './BusinessContext';
import { useFinancialYear } from './FinancialYearContext';
import { useData } from './DataContext';
import { useI18n } from './i18n/I18nContext';
import { useDialog } from './DialogContext';

const Journal = () => {
  const { currentBusiness } = useBusiness();
  const { t } = useI18n();
  const { activeFY } = useFinancialYear();
  const { addItem, deleteItem, getItems } = useData();
  const { confirm, showAlert } = useDialog();
  const [view, setView] = useState('list');
  const [entryDate, setEntryDate] = useState(new Date().toISOString().split('T')[0]);
  const [reference, setReference] = useState('');
  const [description, setDescription] = useState('');
  const [lines, setLines] = useState([{ account: '', description: '', debit: 0, credit: 0 }]);
  const [isSaving, setIsSaving] = useState(false);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const entries = getItems('journalEntries').filter(e => e.businessId === currentBusiness?.id).filter(r => !activeFY || !r.date || (r.date >= activeFY.start && r.date <= activeFY.end)).reverse();

  useEffect(() => {
    if (view === 'create' && !isSaving) {
      setEntryDate(new Date().toISOString().split('T')[0]);
      setReference('');
      setDescription('');
      setLines([{ account: '', description: '', debit: 0, credit: 0 }]);
    }
  }, [view, isSaving]);

  const addLine = () => setLines([...lines, { account: '', description: '', debit: 0, credit: 0 }]);
  const removeLine = (idx) => {
    const next = lines.filter((_, i) => i !== idx);
    setLines(next.length ? next : [{ account: '', description: '', debit: 0, credit: 0 }]);
  };
  const updateLine = (idx, field, value) => {
    const next = [...lines];
    next[idx] = { ...next[idx], [field]: value };
    setLines(next);
  };

  const totalDebit = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
  const balanced = Math.abs(totalDebit - totalCredit) < 0.01;

  const handleSave = async () => {
    if (!currentBusiness?.id) {
      await showAlert({ title: 'Business not selected', message: 'Please select a business before saving.', variant: 'warning' });
      return;
    }
    if (!balanced) {
      await showAlert({ title: 'Unbalanced entry', message: 'Debit and Credit totals must be equal before saving.', variant: 'warning' });
      return;
    }
    const validLines = lines.filter(l => (l.account && l.account.trim()) && ((Number(l.debit) || 0) > 0 || (Number(l.credit) || 0) > 0));
    if (!validLines.length) {
      await showAlert({ title: 'No lines added', message: 'Add at least one line with an account and amount.', variant: 'warning' });
      return;
    }
    setIsSaving(true);
    try {
      await addItem('journalEntries', {
        businessId: currentBusiness.id,
        date: entryDate,
        reference: reference.trim() || `J-${Date.now()}`,
        description: description.trim() || '',
        lines: validLines.map(l => ({
          account: l.account.trim(),
          description: (l.description || '').trim(),
          debit: Number(l.debit) || 0,
          credit: Number(l.credit) || 0
        })),
        totalDebit: totalDebit,
        totalCredit: totalCredit
      });
      setView('list');
    } catch (e) {
      await showAlert({ title: 'Save failed', message: 'Save failed: ' + (e?.message || e), variant: 'danger' });
    }
    setIsSaving(false);
  };

  const handleDelete = async (id) => {
    const ok = await confirm({ title: 'Delete Journal Entry', message: 'This journal entry will be permanently deleted. This cannot be undone.', confirmLabel: 'Delete', variant: 'danger' });
    if (ok) await deleteItem('journalEntries', id);
  };

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 600, fontSize: '1rem' }}>{t('doc.journalEntries')}</Typography>
        <Button variant="contained" startIcon={<Plus size={18} />} onClick={() => setView(view === 'list' ? 'create' : 'list')}>
          {view === 'list' ? t('doc.newEntry') : t('doc.backToList')}
        </Button>
      </Box>

      {view === 'list' && (
        <Card>
          <CardContent>
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Date</TableCell>
                    <TableCell>Reference</TableCell>
                    <TableCell>Description</TableCell>
                    <TableCell align="right">Debit</TableCell>
                    <TableCell align="right">Credit</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {entries.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage).map((ent) => (
                    <TableRow key={ent.id}>
                      <TableCell>{ent.date}</TableCell>
                      <TableCell>{ent.reference}</TableCell>
                      <TableCell sx={{ maxWidth: 200 }}>{ent.description || '-'}</TableCell>
                      <TableCell align="right">₹{ent.totalDebit?.toFixed(2)}</TableCell>
                      <TableCell align="right">₹{ent.totalCredit?.toFixed(2)}</TableCell>
                      <TableCell align="right">
                        <IconButton size="small" color="error" onClick={() => handleDelete(ent.id)}><Trash2 size={16} /></IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            <TablePagination rowsPerPageOptions={[10, 25, 50]} count={entries.length} page={page} onPageChange={(_, p) => setPage(p)} rowsPerPage={rowsPerPage} onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }} />
          </CardContent>
        </Card>
      )}

      {view === 'create' && (
        <Card sx={{ mt: 2 }}>
          <CardContent>
            <Grid container spacing={2}>
              <Grid item xs={6} sm={4} md={2}>
                <TextField fullWidth size="small" type="date" label="Date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} InputLabelProps={{ shrink: true }} />
              </Grid>
              <Grid item xs={6} sm={4} md={2}>
                <TextField fullWidth size="small" label="Reference" value={reference} onChange={(e) => setReference(e.target.value)} />
              </Grid>
              <Grid item xs={12}>
                <TextField fullWidth size="small" label="Description" value={description} onChange={(e) => setDescription(e.target.value)} multiline rows={1} />
              </Grid>
              <Grid item xs={12}>
                <TableContainer><Table size="small"><TableHead><TableRow><TableCell>Account</TableCell><TableCell>Description</TableCell><TableCell align="right">Debit</TableCell><TableCell align="right">Credit</TableCell><TableCell></TableCell></TableRow></TableHead>
                  <TableBody>
                    {lines.map((row, idx) => (
                      <TableRow key={idx}>
                        <TableCell><TextField size="small" value={row.account} onChange={(e) => updateLine(idx, 'account', e.target.value)} placeholder="Account name" sx={{ minWidth: 140 }} /></TableCell>
                        <TableCell><TextField size="small" value={row.description} onChange={(e) => updateLine(idx, 'description', e.target.value)} sx={{ minWidth: 160 }} /></TableCell>
                        <TableCell><TextField type="number" size="small" value={row.debit || ''} onChange={(e) => { const v = parseFloat(e.target.value) || 0; updateLine(idx, 'debit', v); if (v > 0) updateLine(idx, 'credit', 0); }} inputProps={{ min: 0 }} sx={{ width: 100 }} /></TableCell>
                        <TableCell><TextField type="number" size="small" value={row.credit || ''} onChange={(e) => { const v = parseFloat(e.target.value) || 0; updateLine(idx, 'credit', v); if (v > 0) updateLine(idx, 'debit', 0); }} inputProps={{ min: 0 }} sx={{ width: 100 }} /></TableCell>
                        <TableCell><IconButton size="small" onClick={() => removeLine(idx)}><Trash2 size={14} /></IconButton></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table></TableContainer>
                <Button size="small" startIcon={<Plus size={14} />} onClick={addLine} sx={{ mt: 1 }}>Add line</Button>
              </Grid>
              <Grid item xs={12}>
                <Typography color={balanced ? 'text.primary' : 'error.main'}>Total Debit: ₹{totalDebit.toFixed(2)} | Total Credit: ₹{totalCredit.toFixed(2)} {!balanced && '(must be equal)'}</Typography>
                <Box sx={{ mt: 2 }}>
                  <Button variant="outlined" sx={{ mr: 1 }} onClick={() => setView('list')}>Cancel</Button>
                  <Button variant="contained" onClick={handleSave} disabled={isSaving || !balanced}>Save Entry</Button>
                </Box>
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      )}
    </Box>
  );
};

export default Journal;
