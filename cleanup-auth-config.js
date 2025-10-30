const { sequelize } = require('./server/config/database');
const AuthConfig = require('./server/models/AuthConfig');

async function cleanup() {
  try {
    console.log('Connecting to database...');
    await sequelize.authenticate();
    console.log('Database connected!');

    console.log('Deleting all AuthConfig records...');
    const deleted = await AuthConfig.destroy({ where: {} });
    console.log(`Deleted ${deleted} AuthConfig records`);

    const remaining = await AuthConfig.count();
    console.log(`Remaining AuthConfig records: ${remaining}`);

    console.log('Cleanup completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error during cleanup:', error);
    process.exit(1);
  }
}

cleanup();

