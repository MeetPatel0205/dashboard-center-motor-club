const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'centermotorclub',
  password: 'root',
  port: 5432,
});

function parseDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  dateStr = dateStr.trim();
  if (!dateStr) return null;

  // Handles YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;

  // Handles DD/MM/YYYY or DD-MM-YYYY
  const parts = dateStr.split(/[/.-]/);
  if (parts.length === 3) {
    if (parts[2].length === 4) {
      const day = parts[0].padStart(2, '0');
      const month = parts[1].padStart(2, '0');
      const year = parts[2];
      return `${year}-${month}-${day}`;
    }
  }
  return null;
}

async function seed() {
  try {
    console.log('Connecting to PostgreSQL database "centermotorclub"...');

    // 1. Run Schema SQL DDL
    const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await pool.query(schemaSql);
    console.log('Schema tables created/verified successfully!');

    // 2. Read motors dataset
    const jsonData = JSON.parse(fs.readFileSync(path.join(__dirname, 'ht_motors_data.json'), 'utf8'));
    const motors = jsonData.motors || [];

    console.log(`Clearing existing records and inserting ${motors.length} motors...`);
    await pool.query('TRUNCATE TABLE motors CASCADE');
    await pool.query('TRUNCATE TABLE users CASCADE');

    // 3. Batch insert motors
    for (const m of motors) {
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
        );
      `;

      const values = [
        m.id,
        m.motor_type || 'HT',
        m.motor_sr_no || 'MTR-0000',
        m.motor_name || m.application || 'Motor Asset',
        m.application || m.motor_name || 'Industrial Drive',
        m.plant || 'Main Plant',
        m.location || m.plant || 'Area 1',
        parseFloat(m.kw) || 0,
        m.voltage || (m.motor_type === 'LT' ? '415 V' : '6.6 kV'),
        parseFloat(m.current || m.flc) || 0,
        parseFloat(m.flc || m.current) || 0,
        parseInt(m.rpm) || 1480,
        m.frame_size || '315M',
        m.make || 'ABB',
        m.status || 'Done',
        m.is_critical || false,
        m.testing_remark || 'Normal',
        m.report_no || 'CEID/VAL/2026',
        m.tan_delta_0_2vl || '0.500',
        m.tan_delta_phase_ground || '0.520',
        m.tan_delta_tip_up || '0.020',
        parseDate(m.last_test_date),
        parseDate(m.due_date)
      ];

      await pool.query(query, values);
    }

    console.log(`Successfully seeded ${motors.length} motors into PostgreSQL!`);

    // 4. Seed initial users
    const initialUsers = [
      ['USR-001', 'Amit Mishra', 'admin@centermotor.com', 'admin123', 'admin', 'All Departments', 'Active', '2026-07-29 12:45'],
      ['USR-002', 'Plant Lead Engineer', 'engineer@centermotor.com', 'admin123', 'admin', '300MW Power Plant', 'Active', '2026-07-28 09:15'],
      ['USR-003', 'Field Operator User', 'viewer@centermotor.com', 'viewer123', 'viewer', 'Blast Furnace & Sinter', 'Active', '2026-07-29 10:20']
    ];

    for (const u of initialUsers) {
      await pool.query(
        'INSERT INTO users (id, name, email, password, role, dept, status, last_login) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
        u
      );
    }

    console.log('Successfully seeded user accounts into PostgreSQL!');

  } catch (err) {
    console.error('Error seeding database:', err);
  } finally {
    await pool.end();
  }
}

seed();
