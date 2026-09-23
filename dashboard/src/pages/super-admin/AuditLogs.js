import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Button, Table, TableBody, TableCell, TableHead,
  TableRow, TableContainer, Chip, CircularProgress,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField,
  Select, MenuItem, FormControl, InputLabel, Tooltip, TablePagination,
  Grid, Card, CardContent
} from '@mui/material';
import {
  Refresh,
  Visibility,
  Search as SearchIcon,
  History,
  DataObject,
} from '@mui/icons-material';
import axios from 'axios';
import { API_URL } from '../../context/AuthContext';

const getActionColor = (action) => {
  switch (action) {
    case 'CREATE_INSTITUTE':
      return { bg: '#dcfce7', text: '#16a34a' };
    case 'UPDATE_PLAN':
      return { bg: '#e0e7ff', text: '#4338ca' };
    case 'TOGGLE_FEATURES':
      return { bg: '#fef3c7', text: '#d97706' };
    case 'SUSPEND_INSTITUTE':
      return { bg: '#fee2e2', text: '#dc2626' };
    case 'ACTIVATE_INSTITUTE':
      return { bg: '#dcfce7', text: '#16a34a' };
    case 'RESET_ADMIN_PASSWORD':
      return { bg: '#f3e8ff', text: '#7e22ce' };
    default:
      return { bg: '#f1f5f9', text: '#475569' };
  }
};

const DiffModal = ({ open, onClose, log }) => {
  if (!log) return null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
      <DialogTitle sx={{ fontWeight: 700, fontSize: 18, display: 'flex', alignItems: 'center', gap: 1 }}>
        <DataObject sx={{ color: '#6366f1' }} />
        Audit State Diff — {log.action}
      </DialogTitle>
      <DialogContent sx={{ pt: 2 }}>
        <Box sx={{ mb: 2 }}>
          <Typography sx={{ fontSize: 13, color: '#64748b' }}>
            Entity: <strong>{log.entity || 'N/A'}</strong> (ID: {log.entityId || log.instituteId || '—'})
          </Typography>
          <Typography sx={{ fontSize: 13, color: '#64748b' }}>
            Logged At: {new Date(log.createdAt).toLocaleString()} | Actor: {log.actorId || 'SYSTEM'} ({log.role})
          </Typography>
          {log.ip && (
            <Typography sx={{ fontSize: 12, color: '#94a3b8' }}>
              IP: {log.ip} | User-Agent: {log.userAgent || '—'}
            </Typography>
          )}
        </Box>

        <Grid container spacing={2}>
          <Grid item xs={12} sm={6}>
            <Card sx={{ bgcolor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 2 }}>
              <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                <Typography sx={{ fontWeight: 700, fontSize: 13, color: '#dc2626', mb: 1 }}>
                  BEFORE STATE
                </Typography>
                <Box
                  component="pre"
                  sx={{
                    fontFamily: 'monospace',
                    fontSize: 12,
                    p: 1.5,
                    bgcolor: '#ffffff',
                    borderRadius: 1.5,
                    border: '1px solid #cbd5e1',
                    maxHeight: 300,
                    overflow: 'auto',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {log.before ? JSON.stringify(log.before, null, 2) : 'null (New Record)'}
                </Box>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6}>
            <Card sx={{ bgcolor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 2 }}>
              <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                <Typography sx={{ fontWeight: 700, fontSize: 13, color: '#16a34a', mb: 1 }}>
                  AFTER STATE
                </Typography>
                <Box
                  component="pre"
                  sx={{
                    fontFamily: 'monospace',
                    fontSize: 12,
                    p: 1.5,
                    bgcolor: '#ffffff',
                    borderRadius: 1.5,
                    border: '1px solid #cbd5e1',
                    maxHeight: 300,
                    overflow: 'auto',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {log.after ? JSON.stringify(log.after, null, 2) : 'null (Deleted)'}
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose} variant="contained" sx={{ bgcolor: '#6366f1', borderRadius: 2 }}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
};

const AuditLogs = () => {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState('');
  const [search, setSearch] = useState('');
  const [activeDiff, setActiveDiff] = useState(null);

  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${API_URL}/super-admin/audit-logs`, {
        params: {
          page: page + 1,
          limit: rowsPerPage,
          action: actionFilter || undefined,
          search: search.trim() || undefined,
        },
      });
      setLogs(res.data.logs || []);
      setTotal(res.data.total || 0);
    } catch (err) {
      console.error('Failed to load audit logs:', err);
    } finally {
      setLoading(false);
    }
  }, [page, rowsPerPage, actionFilter, search]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleChangePage = (event, newPage) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  return (
    <Box sx={{ pb: 6 }}>
      {/* Header */}
      <Box sx={{ mb: 4, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5 }}>
            <History sx={{ color: '#6366f1', fontSize: 28 }} />
            <Typography variant="h5" sx={{ fontWeight: 800, color: '#0f172a' }}>
              Platform Audit Logs
            </Typography>
          </Box>
          <Typography sx={{ color: '#64748b', fontSize: 13 }}>
            Immutable trace of administrative actions, plan modifications, quota updates, and security events
          </Typography>
        </Box>

        <Button
          variant="outlined"
          startIcon={<Refresh />}
          onClick={fetchLogs}
          disabled={loading}
          sx={{
            borderColor: '#e2e8f0',
            color: '#1e293b',
            bgcolor: 'white',
            '&:hover': { bgcolor: '#f8fafc' },
            borderRadius: 2,
            textTransform: 'none',
            fontWeight: 600,
          }}
        >
          Refresh Logs
        </Button>
      </Box>

      {/* Filter Bar */}
      <Card sx={{ mb: 3, borderRadius: 3, border: '1px solid #e2e8f0', boxShadow: 'none' }}>
        <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} sm={6} md={4}>
              <TextField
                placeholder="Search action, entity, IP or actor..."
                size="small"
                fullWidth
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(0);
                }}
                InputProps={{
                  startAdornment: <SearchIcon sx={{ color: '#94a3b8', mr: 1, fontSize: 20 }} />,
                }}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              />
            </Grid>

            <Grid item xs={12} sm={6} md={3}>
              <FormControl size="small" fullWidth>
                <InputLabel>Filter by Action</InputLabel>
                <Select
                  value={actionFilter}
                  label="Filter by Action"
                  onChange={(e) => {
                    setActionFilter(e.target.value);
                    setPage(0);
                  }}
                  sx={{ borderRadius: 2 }}
                >
                  <MenuItem value="">All Actions</MenuItem>
                  <MenuItem value="CREATE_INSTITUTE">Create Institute</MenuItem>
                  <MenuItem value="UPDATE_PLAN">Update Plan & Quota</MenuItem>
                  <MenuItem value="TOGGLE_FEATURES">Toggle Features</MenuItem>
                  <MenuItem value="SUSPEND_INSTITUTE">Suspend Institute</MenuItem>
                  <MenuItem value="ACTIVATE_INSTITUTE">Activate Institute</MenuItem>
                  <MenuItem value="RESET_ADMIN_PASSWORD">Reset Admin Password</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Table */}
      <Box sx={{ borderRadius: 3, border: '1px solid #e2e8f0', overflow: 'hidden', bgcolor: 'white' }}>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow sx={{ bgcolor: '#f8fafc' }}>
                <TableCell sx={{ fontWeight: 700, color: '#64748b', fontSize: 12 }}>TIMESTAMP</TableCell>
                <TableCell sx={{ fontWeight: 700, color: '#64748b', fontSize: 12 }}>ACTION</TableCell>
                <TableCell sx={{ fontWeight: 700, color: '#64748b', fontSize: 12 }}>ACTOR / ROLE</TableCell>
                <TableCell sx={{ fontWeight: 700, color: '#64748b', fontSize: 12 }}>TARGET ENTITY</TableCell>
                <TableCell sx={{ fontWeight: 700, color: '#64748b', fontSize: 12 }}>IP ADDRESS</TableCell>
                <TableCell sx={{ fontWeight: 700, color: '#64748b', fontSize: 12 }}>CHANGES</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} sx={{ textAlign: 'center', py: 6 }}>
                    <CircularProgress sx={{ color: '#6366f1' }} />
                  </TableCell>
                </TableRow>
              ) : logs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} sx={{ textAlign: 'center', py: 6 }}>
                    <History sx={{ fontSize: 44, color: '#cbd5e1', mb: 1 }} />
                    <Typography sx={{ color: '#94a3b8', fontSize: 14 }}>
                      No audit events found. Platform actions will appear here automatically.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                logs.map((log) => {
                  const colors = getActionColor(log.action);
                  const hasDiff = log.before || log.after;

                  return (
                    <TableRow key={log._id} hover>
                      <TableCell sx={{ color: '#475569', fontSize: 12, whiteSpace: 'nowrap' }}>
                        {new Date(log.createdAt).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={log.action}
                          size="small"
                          sx={{
                            bgcolor: colors.bg,
                            color: colors.text,
                            fontWeight: 700,
                            fontSize: 11,
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <Typography sx={{ fontWeight: 600, fontSize: 13, color: '#0f172a' }}>
                          {log.role}
                        </Typography>
                        <Typography sx={{ color: '#94a3b8', fontSize: 11, fontFamily: 'monospace' }}>
                          {log.actorId ? `${String(log.actorId).slice(-8)}` : 'SYSTEM'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography sx={{ fontWeight: 600, fontSize: 13, color: '#334155' }}>
                          {log.entity || 'System'}
                        </Typography>
                        {log.details?.instituteName && (
                          <Typography sx={{ color: '#64748b', fontSize: 11 }}>
                            {log.details.instituteName}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: 12, color: '#64748b' }}>
                        {log.ip || log.ipAddress || '—'}
                      </TableCell>
                      <TableCell>
                        {hasDiff ? (
                          <Tooltip title="View State Diff (Before vs After)">
                            <Button
                              size="small"
                              variant="outlined"
                              startIcon={<Visibility fontSize="small" />}
                              onClick={() => setActiveDiff(log)}
                              sx={{
                                textTransform: 'none',
                                fontSize: 11,
                                borderRadius: 1.5,
                                borderColor: '#cbd5e1',
                                color: '#4338ca',
                                py: 0.3,
                              }}
                            >
                              Diff
                            </Button>
                          </Tooltip>
                        ) : (
                          <Typography sx={{ color: '#94a3b8', fontSize: 12 }}>—</Typography>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>

        <TablePagination
          component="div"
          count={total}
          page={page}
          onPageChange={handleChangePage}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={handleChangeRowsPerPage}
          rowsPerPageOptions={[10, 25, 50, 100]}
        />
      </Box>

      {/* Diff Viewer Modal */}
      <DiffModal open={Boolean(activeDiff)} onClose={() => setActiveDiff(null)} log={activeDiff} />
    </Box>
  );
};

export default AuditLogs;
