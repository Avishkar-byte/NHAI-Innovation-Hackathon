require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const port = process.env.PORT || 10000;

// Middleware
app.use(cors());
app.use(express.json());

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ status: 'DataLake 3.0 Backend is running' });
});

// Sync workers (enrolled faces)
app.post('/api/sync/workers', async (req, res) => {
  const { workers } = req.body;
  if (!workers || !Array.isArray(workers)) {
    return res.status(400).json({ error: 'Invalid payload' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const worker of workers) {
      // Upsert worker
      const query = `
        INSERT INTO workers (employee_id, embedding) 
        VALUES ($1, $2)
        ON CONFLICT (employee_id) 
        DO UPDATE SET embedding = EXCLUDED.embedding
      `;
      await client.query(query, [worker.id, JSON.stringify(worker.embedding)]);
    }
    await client.query('COMMIT');
    res.json({ success: true, synced: workers.length });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Sync workers error:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// Sync attendance logs
app.post('/api/sync/logs', async (req, res) => {
  const { logs } = req.body;
  if (!logs || !Array.isArray(logs)) {
    return res.status(400).json({ error: 'Invalid payload' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const log of logs) {
      const query = `
        INSERT INTO attendance_logs (employee_id, timestamp, liveness_score, status) 
        VALUES ($1, $2, $3, $4)
      `;
      await client.query(query, [log.employee_id || log.id, new Date(log.timestamp), log.score || 1.0, log.status]);
    }
    await client.query('COMMIT');
    res.json({ success: true, synced: logs.length });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Sync logs error:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// Get all workers (Admin dashboard)
app.get('/api/workers', async (req, res) => {
  try {
    const result = await pool.query('SELECT employee_id, created_at FROM workers ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

// Get all logs (Admin dashboard)
app.get('/api/logs', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM attendance_logs ORDER BY timestamp DESC LIMIT 100');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

// Init DB schema endpoint (for testing/hackathon purposes)
app.post('/api/initdb', async (req, res) => {
  const fs = require('fs');
  const path = require('path');
  try {
    const sql = fs.readFileSync(path.join(__dirname, 'init.sql'), 'utf8');
    await pool.query(sql);
    res.json({ success: true, message: 'Database schema initialized' });
  } catch (error) {
    console.error('Init DB error:', error);
    res.status(500).json({ error: 'Failed to initialize database' });
  }
});

app.listen(port, () => {
  console.log(`DataLake 3.0 Backend listening on port ${port}`);
});
