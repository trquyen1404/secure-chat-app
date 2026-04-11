const { Sequelize } = require('sequelize');
const sequelize = require('../config/database');

async function fixSchema() {
  try {
    await sequelize.authenticate();
    console.log('Connected to database.');

    const queryInterface = sequelize.getQueryInterface();
    
    console.log('Adding missing columns to Users table...');
    
    try {
      await queryInterface.addColumn('Users', 'vaultVersion', {
        type: Sequelize.INTEGER,
        defaultValue: 1
      });
      console.log('Added vaultVersion column.');
    } catch (e) {
      console.log('vaultVersion column might already exist or error:', e.message);
    }

    try {
      await queryInterface.addColumn('Users', 'vaultData', {
        type: Sequelize.TEXT('long'),
        allowNull: true
      });
      console.log('Added vaultData column.');
    } catch (e) {
      console.log('vaultData column might already exist or error:', e.message);
    }

    console.log('Schema fix complete.');
    process.exit(0);
  } catch (error) {
    console.error('Failed to fix schema:', error);
    process.exit(1);
  }
}

fixSchema();
