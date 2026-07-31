-- PostgreSQL Schema for Center Motor Club Maintenance Portal

-- 1. Create Motors Table
CREATE TABLE IF NOT EXISTS motors (
  id VARCHAR(50) PRIMARY KEY,
  motor_type VARCHAR(10) NOT NULL CHECK (motor_type IN ('HT', 'LT')),
  motor_sr_no VARCHAR(100) NOT NULL,
  motor_name VARCHAR(255) NOT NULL,
  application VARCHAR(255),
  plant VARCHAR(100) NOT NULL,
  location VARCHAR(150),
  kw NUMERIC(10, 2),
  voltage VARCHAR(50),
  current NUMERIC(10, 2),
  flc NUMERIC(10, 2),
  rpm INTEGER,
  frame_size VARCHAR(50),
  make VARCHAR(100),
  status VARCHAR(20) DEFAULT 'Done' CHECK (status IN ('Done', 'Due')),
  is_critical BOOLEAN DEFAULT FALSE,
  testing_remark TEXT,
  report_no VARCHAR(100),
  tan_delta_0_2vl VARCHAR(20),
  tan_delta_phase_ground VARCHAR(20),
  tan_delta_tip_up VARCHAR(20),
  last_test_date DATE,
  due_date DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Create Users Table
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  email VARCHAR(150) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  role VARCHAR(20) DEFAULT 'viewer' CHECK (role IN ('admin', 'viewer')),
  dept VARCHAR(150) DEFAULT 'All Departments',
  status VARCHAR(20) DEFAULT 'Active' CHECK (status IN ('Active', 'Suspended')),
  last_login VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Create Test Logs Table
CREATE TABLE IF NOT EXISTS test_logs (
  id SERIAL PRIMARY KEY,
  motor_id VARCHAR(50) REFERENCES motors(id) ON DELETE CASCADE,
  test_date DATE NOT NULL,
  due_date DATE,
  report_no VARCHAR(100),
  testing_remark TEXT,
  tan_delta_0_2vl VARCHAR(20),
  tan_delta_phase_ground VARCHAR(20),
  tan_delta_tip_up VARCHAR(20),
  tested_by VARCHAR(150),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_motors_type ON motors(motor_type);
CREATE INDEX IF NOT EXISTS idx_motors_status ON motors(status);
CREATE INDEX IF NOT EXISTS idx_motors_plant ON motors(plant);
CREATE INDEX IF NOT EXISTS idx_motors_critical ON motors(is_critical);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
