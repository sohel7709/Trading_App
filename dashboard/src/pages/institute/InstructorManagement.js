import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Button, Table, TableBody, TableCell, TableHead,
  TableRow, TableContainer, Chip, IconButton, CircularProgress,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField,
  Alert, Snackbar, Tooltip, Avatar,
} from '@mui/material';
import { Add as AddIcon, ToggleOn, ToggleOff } from '@mui/icons-material';
import axios from 'axios';
import { API_URL } from '../../context/AuthContext';

// ── Add Instructor Modal ───────────────────────────────────────────────────
const AddInstructorModal = ({ open, onClose, onAdded }) => {
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (f) => (e) => setForm(p => ({ ...p, [f]: e.target.value }));

  const handleSubmit = async () => {
    if (!form.name || !form.email || !form.password) {
      setError('All fields are required.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await axios.post(`${API_URL}/institutes/instructor`, form);
      onAdded(res.data);
      setForm({ name: '', email: '', password: '' });
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create instructor.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
      <DialogTitle sx={{ fontWeight: 700, fontSize: 18 }}>Add Instructor</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: 2 }}>
        {error && <Alert severity="error" sx={{ borderRadius: 2 }}>{error}</Alert>}
        <TextField label="Full Name *" value={form.name} onChange={handleChange('name')} fullWidth
          sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }} />
        <TextField label="Email *" type="email" value={form.email} onChange={handleChange('email')} fullWidth
          sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }} />
        <TextField label="Password *" type="password" value={form.password} onChange={handleChange('password')} fullWidth
          placeholder="Min 8 characters" sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }} />
        <Alert severity="info" sx={{ borderRadius: 2, fontSize: 12 }}>
          The instructor will use this email and password to log in to the TradeLab dashboard.
        </Alert>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 3, gap: 1 }}>
        <Button onClick={onClose} sx={{ color: '#64748b' }}>Cancel</Button>
        <Button
          variant="contained" onClick={handleSubmit} disabled={loading}
          sx={{ bgcolor: '#8b5cf6', '&:hover': { bgcolor: '#7c3aed' }, borderRadius: 2, px: 3, fontWeight: 600 }}
        >
          {loading ? <CircularProgress size={20} sx={{ color: 'white' }} /> : 'Add Instructor'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// ── Main Page ──────────────────────────────────────────────────────────────
const InstructorManagement = () => {
  const [instructors, setInstructors] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [addOpen, setAddOpen]         = useState(false);
  const [toast, setToast]             = useState({ open: false, msg: '', severity: 'success' });

  const showToast = (msg, severity = 'success') => setToast({ open: true, msg, severity });

  const fetchInstructors = useCallback(async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${API_URL}/institutes/instructors`);
      setInstructors(res.data);
    } catch {
      showToast('Failed to load instructors', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchInstructors(); }, [fetchInstructors]);

  const handleAdded = (instructor) => {
    setAddOpen(false);
    setInstructors(prev => [instructor, ...prev]);
    showToast(`Instructor "${instructor.name}" added successfully`);
  };

  const toggleStatus = async (instructor) => {
    try {
      await axios.patch(`${API_URL}/institutes/instructors/${instructor._id}/status`, {
        isActive: !instructor.isActive
      });
      setInstructors(prev =>
        prev.map(i => i._id === instructor._id ? { ...i, isActive: !i.isActive } : i)
      );
      showToast(`Instructor ${!instructor.isActive ? 'activated' : 'deactivated'}`);
    } catch {
      showToast('Failed to update status', 'error');
    }
  };

  return (
    <Box>
      <Box sx={{ mb: 4, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 800, color: '#0f172a', mb: 0.5 }}>Instructors</Typography>
          <Typography sx={{ color: '#64748b', fontSize: 14 }}>
            {instructors.length} instructor{instructors.length !== 1 ? 's' : ''} in your institute
          </Typography>
        </Box>
        <Button
          id="add-instructor-btn"
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setAddOpen(true)}
          sx={{ bgcolor: '#8b5cf6', '&:hover': { bgcolor: '#7c3aed' }, borderRadius: 2, fontWeight: 600, px: 3, py: 1.5 }}
        >
          Add Instructor
        </Button>
      </Box>

      <Box sx={{ borderRadius: 3, border: '1px solid #e2e8f0', overflow: 'hidden', bgcolor: 'white' }}>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow sx={{ bgcolor: '#f8fafc' }}>
                <TableCell sx={{ fontWeight: 700, color: '#64748b', fontSize: 12 }}>INSTRUCTOR</TableCell>
                <TableCell sx={{ fontWeight: 700, color: '#64748b', fontSize: 12 }}>USER ID</TableCell>
                <TableCell sx={{ fontWeight: 700, color: '#64748b', fontSize: 12 }}>EMAIL</TableCell>
                <TableCell sx={{ fontWeight: 700, color: '#64748b', fontSize: 12 }}>STATUS</TableCell>
                <TableCell sx={{ fontWeight: 700, color: '#64748b', fontSize: 12 }}>JOINED</TableCell>
                <TableCell sx={{ fontWeight: 700, color: '#64748b', fontSize: 12 }}>ACTIONS</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} sx={{ textAlign: 'center', py: 6 }}>
                    <CircularProgress sx={{ color: '#8b5cf6' }} />
                  </TableCell>
                </TableRow>
              ) : instructors.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} sx={{ textAlign: 'center', py: 6, color: '#94a3b8' }}>
                    No instructors yet. Add your first instructor above.
                  </TableCell>
                </TableRow>
              ) : (
                instructors.map((instructor) => (
                  <TableRow key={instructor._id} hover>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <Avatar sx={{ width: 32, height: 32, bgcolor: '#8b5cf6', fontSize: 13 }}>
                          {instructor.name?.charAt(0)}
                        </Avatar>
                        <Typography sx={{ fontWeight: 600, color: '#0f172a', fontSize: 14 }}>
                          {instructor.name}
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Chip label={instructor.userId} size="small" sx={{ fontFamily: 'monospace', bgcolor: '#f1f5f9', color: '#475569' }} />
                    </TableCell>
                    <TableCell sx={{ color: '#475569', fontSize: 13 }}>{instructor.email}</TableCell>
                    <TableCell>
                      <Chip
                        label={instructor.isActive ? 'Active' : 'Inactive'}
                        size="small"
                        sx={{
                          bgcolor: instructor.isActive ? '#dcfce7' : '#f1f5f9',
                          color: instructor.isActive ? '#16a34a' : '#64748b',
                          fontWeight: 600, fontSize: 11,
                        }}
                      />
                    </TableCell>
                    <TableCell sx={{ color: '#64748b', fontSize: 13 }}>
                      {new Date(instructor.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </TableCell>
                    <TableCell>
                      <Tooltip title={instructor.isActive ? 'Deactivate' : 'Activate'}>
                        <IconButton size="small" onClick={() => toggleStatus(instructor)}
                          sx={{ color: instructor.isActive ? '#10b981' : '#94a3b8' }}>
                          {instructor.isActive ? <ToggleOn /> : <ToggleOff />}
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>

      <AddInstructorModal open={addOpen} onClose={() => setAddOpen(false)} onAdded={handleAdded} />
      <Snackbar open={toast.open} autoHideDuration={4000} onClose={() => setToast(t => ({ ...t, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
        <Alert severity={toast.severity} sx={{ borderRadius: 2, fontWeight: 500 }}>{toast.msg}</Alert>
      </Snackbar>
    </Box>
  );
};

export default InstructorManagement;
