const { sequelize } = require('./server/config/database');
const User = require('./server/models/User');

async function createAdmin() {
  try {
    console.log('Connecting to database...');
    await sequelize.authenticate();
    console.log('Database connected!');

    // Check if admin exists
    const existingAdmin = await User.findOne({ where: { username: 'admin' } });
    if (existingAdmin) {
      console.log('Admin user already exists');
      process.exit(0);
    }

    // Create admin user
    const admin = await User.create({
      username: 'admin',
      email: 'admin@example.com',
      password: 'admin123', // Will be hashed by User model
      role: 'ADMIN',
    });

    console.log('Admin user created successfully!');
    console.log('Username: admin');
    console.log('Password: admin123');
    console.log('Role: ADMIN');

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

createAdmin();

