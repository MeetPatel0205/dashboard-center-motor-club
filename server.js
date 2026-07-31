/* ==========================================================================
   CENTER MOTOR CLUB - EXPRESS REST API BACKEND (SECURED WITH RBAC GUARDS)
   Connected to Local PostgreSQL Database (centermotorclub on localhost:5432)
   ========================================================================== */

const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 5000;

// PostgreSQL Connection Pool
const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;
const poolConfig = connectionString
  ? { 
      connectionString: connectionString,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 5000 // Timeout before Vercel kills the function
    }
  : {
      user: process.env.PGUSER || 'postgres',
      host: process.env.PGHOST || 'localhost',
      database: process.env.PGDATABASE || 'centermotorclub',
      password: process.env.PGPASSWORD || 'root',
      port: process.env.PGPORT || 5432,
    };

const pool = new Pool(poolConfig);

app.use(cors());
app.use(express.json());

// Serve static frontend files (index.html, app.js, styles.css) from the same Express server!
app.use(express.static(__dirname));

// Security Middleware: Require Admin Role for Write Endpoints
const requireAdmin = (req, res, next) => {
  const userRoleHeader = req.headers['x-user-role'];
  if (userRoleHeader !== 'admin') {
    return res.status(403).json({ error: '403 Forbidden: Admin privileges required to perform database write operations.' });
  }
  next();
};

// Debug Endpoint to test Database Connection explicitly
app.get('/api/debug', async (req, res) => {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW()');
    client.release();
    
    // Check if tables exist
    try {
      const tableCheck = await pool.query('SELECT COUNT(*) FROM motors');
      res.json({ status: 'success', message: 'Connected to Supabase DB successfully!', time: result.rows[0].now, motorsCount: tableCheck.rows[0].count });
    } catch (tableErr) {
      res.json({ status: 'warning', message: 'Connected to Supabase, but motors table is missing!', error: tableErr.message });
    }
  } catch (err) {
    res.status(500).json({ status: 'error', error: err.message, stack: err.stack, connectionStringUsed: !!poolConfig.connectionString });
  }
});

// 1. GET Dashboard Aggregated Metrics Summary (Public for Authenticated Session)
app.get('/api/summary', async (req, res) => {
  try {
    const totalRes = await pool.query('SELECT COUNT(*) FROM motors');
    const htRes = await pool.query("SELECT COUNT(*) FROM motors WHERE motor_type = 'HT'");
    const ltRes = await pool.query("SELECT COUNT(*) FROM motors WHERE motor_type = 'LT'");
    const critRes = await pool.query('SELECT COUNT(*) FROM motors WHERE is_critical = TRUE');
    const doneRes = await pool.query("SELECT COUNT(*) FROM motors WHERE status = 'Done'");
    const dueRes = await pool.query("SELECT COUNT(*) FROM motors WHERE status = 'Due'");

    const plantsRes = await pool.query('SELECT DISTINCT plant FROM motors WHERE plant IS NOT NULL ORDER BY plant');
    const makesRes = await pool.query('SELECT DISTINCT make FROM motors WHERE make IS NOT NULL AND make != \'Unknown\' ORDER BY make');

    // Department-wise Breakdown SQL Query
    const deptRes = await pool.query(`
      SELECT plant AS department,
        COUNT(*) AS total_motors,
        COUNT(CASE WHEN status = 'Done' THEN 1 END) AS testing_done,
        COUNT(CASE WHEN status = 'Due' THEN 1 END) AS testing_due
      FROM motors
      GROUP BY plant
      ORDER BY total_motors DESC
    `);

    res.json({
      summary: {
        total_motors: parseInt(totalRes.rows[0].count),
        ht_motors_count: parseInt(htRes.rows[0].count),
        lt_motors_count: parseInt(ltRes.rows[0].count),
        critical_count: parseInt(critRes.rows[0].count),
        status_counts: {
          Done: parseInt(doneRes.rows[0].count),
          Due: parseInt(dueRes.rows[0].count)
        },
        total_plants: plantsRes.rows.length,
        total_makes: makesRes.rows.length,
        plants: plantsRes.rows.map(r => r.plant),
        makes: makesRes.rows.map(r => r.make)
      },
      department_summary: deptRes.rows.map(r => ({
        department: r.department,
        total_motors: parseInt(r.total_motors),
        testing_done: parseInt(r.testing_done),
        testing_due: parseInt(r.testing_due)
      }))
    });
  } catch (err) {
    console.error('Error fetching summary:', err);
    res.status(500).json({ error: 'Database error fetching metrics' });
  }
});

// 2. GET Motors List (with Filter & Pagination)
app.get('/api/motors', async (req, res) => {
  try {
    const { motor_type, search, status, plant, make, is_critical } = req.query;

    let query = 'SELECT * FROM motors WHERE 1=1';
    const params = [];

    if (motor_type) {
      params.push(motor_type);
      query += ` AND motor_type = $${params.length}`;
    }

    if (status) {
      if (status === 'Critical') {
        query += ' AND is_critical = TRUE';
      } else {
        params.push(status);
        query += ` AND status = $${params.length}`;
      }
    }

    if (is_critical === 'true') {
      query += ' AND is_critical = TRUE';
    }

    if (plant) {
      params.push(plant);
      query += ` AND plant = $${params.length}`;
    }

    if (make) {
      params.push(make);
      query += ` AND make = $${params.length}`;
    }

    if (search) {
      params.push(`%${search.toLowerCase()}%`);
      query += ` AND (LOWER(motor_sr_no) LIKE $${params.length} OR LOWER(motor_name) LIKE $${params.length} OR LOWER(application) LIKE $${params.length} OR LOWER(plant) LIKE $${params.length} OR LOWER(make) LIKE $${params.length})`;
    }

    query += ' ORDER BY created_at DESC, id DESC';

    const result = await pool.query(query, params);
    res.json({ motors: result.rows, total: result.rows.length });
  } catch (err) {
    console.error('Error fetching motors:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// 3. POST Create New Motor Record (Secured with requireAdmin)
app.post('/api/motors', requireAdmin, async (req, res) => {
  try {
    const m = req.body;
    const motorType = m.motor_type || 'HT';
    
    // Generate new ID if not provided
    const countRes = await pool.query('SELECT COUNT(*) FROM motors');
    const newId = m.id || `${motorType}-MTR-${String(parseInt(countRes.rows[0].count) + 1).padStart(4, '0')}`;

    const query = `
      INSERT INTO motors (
        id, motor_type, motor_sr_no, motor_name, application, plant, location, kw,
        voltage, current, flc, rpm, frame_size, make, status, is_critical,
        testing_remark, report_no, tan_delta_0_2vl, tan_delta_phase_ground, tan_delta_tip_up,
        last_test_date, due_date
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8,
        $9, $10, $11, $12, $13, $14, $15, $16,
        $17, $18, $19, $20, $21,
        $22, $23
      ) RETURNING *;
    `;

    const values = [
      newId,
      motorType,
      m.motor_sr_no,
      m.motor_name || m.application,
      m.application || m.motor_name,
      m.plant,
      m.location || m.plant,
      parseFloat(m.kw) || 0,
      m.voltage,
      parseFloat(m.current || m.flc) || 0,
      parseFloat(m.flc || m.current) || 0,
      parseInt(m.rpm) || 1480,
      m.frame_size,
      m.make,
      m.status || 'Done',
      m.is_critical || false,
      m.testing_remark || 'Normal',
      m.report_no || `CEID/${motorType}/2026/VAL`,
      m.tan_delta_0_2vl || '0.500',
      m.tan_delta_phase_ground || '0.520',
      m.tan_delta_tip_up || '0.020',
      m.last_test_date || null,
      m.due_date || null
    ];

    const result = await pool.query(query, values);
    res.status(201).json({ message: 'Motor record created successfully', motor: result.rows[0] });
  } catch (err) {
    console.error('Error creating motor:', err);
    res.status(500).json({ error: 'Failed to insert motor record into PostgreSQL' });
  }
});

// 4. PUT Update Motor Specs (Secured with requireAdmin)
app.put('/api/motors/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const m = req.body;

    const query = `
      UPDATE motors SET
        motor_type = $1, motor_sr_no = $2, motor_name = $3, application = $4,
        plant = $5, kw = $6, voltage = $7, current = $8, flc = $9,
        rpm = $10, frame_size = $11, make = $12, status = $13, is_critical = $14,
        testing_remark = $15, report_no = $16, tan_delta_0_2vl = $17,
        tan_delta_phase_ground = $18, tan_delta_tip_up = $19,
        last_test_date = $20, due_date = $21, updated_at = CURRENT_TIMESTAMP
      WHERE id = $22 RETURNING *;
    `;

    const values = [
      m.motor_type, m.motor_sr_no, m.motor_name || m.application, m.application || m.motor_name,
      m.plant, parseFloat(m.kw) || 0, m.voltage, parseFloat(m.current || m.flc) || 0, parseFloat(m.flc || m.current) || 0,
      parseInt(m.rpm) || 1480, m.frame_size, m.make, m.status, m.is_critical || false,
      m.testing_remark, m.report_no, m.tan_delta_0_2vl,
      m.tan_delta_phase_ground, m.tan_delta_tip_up,
      m.last_test_date || null, m.due_date || null, id
    ];

    const result = await pool.query(query, values);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Motor not found' });

    res.json({ message: 'Motor updated successfully', motor: result.rows[0] });
  } catch (err) {
    console.error('Error updating motor:', err);
    res.status(500).json({ error: 'Failed to update motor in PostgreSQL' });
  }
});

// 5. DELETE Motor Record (Secured with requireAdmin)
app.delete('/api/motors/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM motors WHERE id = $1', [id]);
    res.json({ message: 'Motor deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete motor' });
  }
});

// 6. User Management Endpoints
app.get('/api/users', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, name, email, role, dept, status, last_login FROM users ORDER BY created_at ASC');
    res.json({ users: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

app.post('/api/users', requireAdmin, async (req, res) => {
  try {
    const { name, email, password, role, dept } = req.body;
    const countRes = await pool.query('SELECT COUNT(*) FROM users');
    const newId = `USR-${String(parseInt(countRes.rows[0].count) + 1).padStart(3, '0')}`;

    const result = await pool.query(
      'INSERT INTO users (id, name, email, password, role, dept, status, last_login) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, name, email, role, dept, status',
      [newId, name, email, password, role || 'viewer', dept || 'All Departments', 'Active', 'Never']
    );

    res.status(201).json({ message: 'User created successfully', user: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create user' });
  }
});

app.put('/api/users/:id/role', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;
    const result = await pool.query('UPDATE users SET role = $1 WHERE id = $2 RETURNING *', [role, id]);
    res.json({ message: 'User role updated', user: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update user role' });
  }
});

app.delete('/api/users/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM users WHERE id = $1', [id]);
    res.json({ message: 'User deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// 7. Login Authentication Endpoint
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await pool.query('SELECT * FROM users WHERE LOWER(email) = LOWER($1) AND password = $2', [email, password]);

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid Email or Password' });
    }

    const user = result.rows[0];
    if (user.status === 'Suspended') {
      return res.status(403).json({ error: 'Account Suspended' });
    }

    // Update last login timestamp
    const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 16);
    await pool.query('UPDATE users SET last_login = $1 WHERE id = $2', [nowStr, user.id]);

    res.json({
      message: 'Login Successful',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        dept: user.dept
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Authentication error' });
  }
});

// 8. Historical Test Logs Endpoints
app.get('/api/motors/:id/history', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'SELECT * FROM test_logs WHERE motor_id = $1 ORDER BY test_date ASC',
      [id]
    );
    res.json({ history: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch test logs' });
  }
});

app.post('/api/motors/:id/history', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { test_date, report_no, testing_remark, tan_delta_0_2vl, tan_delta_phase_ground, tan_delta_tip_up, tested_by } = req.body;
    
    const result = await pool.query(
      `INSERT INTO test_logs 
      (motor_id, test_date, report_no, testing_remark, tan_delta_0_2vl, tan_delta_phase_ground, tan_delta_tip_up, tested_by) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [id, test_date, report_no, testing_remark, tan_delta_0_2vl, tan_delta_phase_ground, tan_delta_tip_up, tested_by]
    );
    
    res.status(201).json({ message: 'Test log added successfully', log: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add test log' });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log('====================================================');
  console.log(`CENTER MOTOR CLUB Express REST API Server (Secured)`);
  console.log(`Connected to local PostgreSQL DB: centermotorclub`);
  console.log(`Server running on http://localhost:${PORT}`);
  console.log('====================================================');
});

// Export the Express API for Vercel Serverless Functions
module.exports = app;
