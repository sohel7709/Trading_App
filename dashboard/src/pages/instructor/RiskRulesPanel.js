import React, { useState, useEffect } from 'react';
import { Box, Typography, Button, Paper, TextField, Grid, Switch, FormControlLabel, Divider } from '@mui/material';
import { Save as SaveIcon } from '@mui/icons-material';
import axios from 'axios';

const RiskRulesPanel = () => {
  const [rules, setRules] = useState({
    maxDailyLossPaise: 0,
    maxPositionValuePaise: 0,
    maxLeverage: 1,
    maxOpenPositions: 5,
    allowedSegments: ['EQUITY']
  });

  const batchId = "64a0b2d3c9f28a3f8c0d1234"; // Hardcoded for demo, normally passed as prop or route param

  useEffect(() => {
    const fetchRules = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await axios.get(`http://localhost:8080/batches/${batchId}/risk-rules`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.data) setRules(res.data);
      } catch (err) {
        console.error("No existing risk rules found, using defaults.", err);
      }
    };
    fetchRules();
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setRules(prev => ({ ...prev, [name]: Number(value) }));
  };

  const handleSave = async () => {
    try {
      const token = localStorage.getItem('token');
      await axios.put(`http://localhost:8080/batches/${batchId}/risk-rules`, rules, {
        headers: { Authorization: `Bearer ${token}` }
      });
      alert('Risk rules updated successfully!');
    } catch (err) {
      alert('Failed to update risk rules.');
    }
  };

  return (
    <Box>
      <Box sx={{ mb: 4 }}>
        <Typography variant="h5" sx={{ fontWeight: 700, color: '#0f172a' }}>Risk Rules Configuration</Typography>
        <Typography variant="body2" sx={{ color: '#64748b' }}>Configure strict risk guardrails for all students in Batch 24-A.</Typography>
      </Box>

      <Paper elevation={0} sx={{ p: 4, borderRadius: 2, border: '1px solid #e2e8f0', maxWidth: 800 }}>
        <Grid container spacing={4}>
          <Grid item xs={12} md={6}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 2 }}>Max Daily Loss (₹)</Typography>
            <TextField 
              fullWidth 
              size="small" 
              name="maxDailyLossPaise"
              type="number"
              value={rules.maxDailyLossPaise / 100} 
              onChange={(e) => setRules(prev => ({...prev, maxDailyLossPaise: Number(e.target.value) * 100}))}
              helperText="Auto-blocks new orders if daily MTM drops below this limit."
            />
          </Grid>
          <Grid item xs={12} md={6}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 2 }}>Max Position Value (₹)</Typography>
            <TextField 
              fullWidth 
              size="small" 
              name="maxPositionValuePaise"
              type="number"
              value={rules.maxPositionValuePaise / 100} 
              onChange={(e) => setRules(prev => ({...prev, maxPositionValuePaise: Number(e.target.value) * 100}))}
              helperText="Maximum total value allowed for a single order."
            />
          </Grid>
          <Grid item xs={12}>
            <Divider sx={{ my: 1 }} />
          </Grid>
          <Grid item xs={12} md={6}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 2 }}>Max Leverage (x)</Typography>
            <TextField 
              fullWidth 
              size="small" 
              name="maxLeverage"
              type="number"
              value={rules.maxLeverage} 
              onChange={handleChange}
              helperText="Intraday leverage multiplier (e.g. 5 = 5x margin)."
            />
          </Grid>
          <Grid item xs={12} md={6}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 2 }}>Max Open Positions</Typography>
            <TextField 
              fullWidth 
              size="small" 
              name="maxOpenPositions"
              type="number"
              value={rules.maxOpenPositions} 
              onChange={handleChange}
              helperText="Prevents over-trading by limiting concurrent open trades."
            />
          </Grid>
          
          <Grid item xs={12}>
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
              <Button 
                variant="contained" 
                startIcon={<SaveIcon />} 
                onClick={handleSave}
                sx={{ bgcolor: '#2563eb', boxShadow: 'none' }}
              >
                Save Rules
              </Button>
            </Box>
          </Grid>
        </Grid>
      </Paper>
    </Box>
  );
};

export default RiskRulesPanel;
