const { Client } = require('pg');

async function testConnection() {
  const passwordsToTry = ['postgres', 'admin', 'root', '123456', 'password', ''];
  let connectedClient = null;
  let successfulPassword = '';

  for (const pass of passwordsToTry) {
    const client = new Client({
      user: 'postgres',
      host: 'localhost',
      database: 'postgres',
      password: pass,
      port: 5432,
    });

    try {
      await client.connect();
      connectedClient = client;
      successfulPassword = pass;
      console.log(`Successfully connected to local PostgreSQL with password: "${pass}"`);
      break;
    } catch (err) {
      // Try next
    }
  }

  if (!connectedClient) {
    console.error('Could not connect with default passwords. Will create database using postgres user or environment configuration.');
    process.exit(1);
  }

  // Create database centermotorclub if not exists
  try {
    const res = await connectedClient.query("SELECT 1 FROM pg_database WHERE datname = 'centermotorclub'");
    if (res.rowCount === 0) {
      await connectedClient.query('CREATE DATABASE centermotorclub');
      console.log('Database "centermotorclub" created successfully!');
    } else {
      console.log('Database "centermotorclub" already exists.');
    }
  } catch (err) {
    console.error('Error creating database:', err.message);
  } finally {
    await connectedClient.end();
  }
}

testConnection();
