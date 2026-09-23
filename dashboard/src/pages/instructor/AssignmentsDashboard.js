import React, { useState, useEffect } from 'react';
import { Box, Typography, Button, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Chip } from '@mui/material';
import { Add as AddIcon } from '@mui/icons-material';
import axios from 'axios';

const AssignmentsDashboard = () => {
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const batchId = "64a0b2d3c9f28a3f8c0d1234";

  useEffect(() => {
    const fetchAssignments = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await axios.get(`http://localhost:8080/batches/${batchId}/assignments`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setAssignments(res.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchAssignments();
  }, []);

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700, color: '#0f172a' }}>Assignments</Typography>
          <Typography variant="body2" sx={{ color: '#64748b' }}>Create scenarios and grade student performance.</Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} sx={{ bgcolor: '#2563eb', boxShadow: 'none' }}>
          New Assignment
        </Button>
      </Box>

      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #e2e8f0', borderRadius: 2 }}>
        <Table sx={{ minWidth: 650 }} aria-label="assignment table">
          <TableHead sx={{ bgcolor: '#f8fafc' }}>
            <TableRow>
              <TableCell sx={{ fontWeight: 600, color: '#475569' }}>Title</TableCell>
              <TableCell sx={{ fontWeight: 600, color: '#475569' }}>Due Date</TableCell>
              <TableCell sx={{ fontWeight: 600, color: '#475569' }}>Status</TableCell>
              <TableCell sx={{ fontWeight: 600, color: '#475569' }} align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={4} align="center">Loading...</TableCell></TableRow>
            ) : assignments.length === 0 ? (
              <TableRow><TableCell colSpan={4} align="center">No assignments created yet.</TableCell></TableRow>
            ) : (
              assignments.map((assignment) => (
                <TableRow key={assignment._id}>
                  <TableCell>
                    <Typography variant="subtitle2" sx={{ fontWeight: 600, color: '#0f172a' }}>{assignment.title}</Typography>
                  </TableCell>
                  <TableCell>{new Date(assignment.dueDate).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <Chip label={assignment.status} size="small" sx={{ bgcolor: assignment.status === 'ACTIVE' ? '#eff6ff' : '#f1f5f9', color: assignment.status === 'ACTIVE' ? '#2563eb' : '#64748b', fontWeight: 600 }} />
                  </TableCell>
                  <TableCell align="right">
                    <Button size="small">View Submissions</Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
};

export default AssignmentsDashboard;
