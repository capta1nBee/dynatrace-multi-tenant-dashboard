require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { connectDB, sequelize } = require('./config/database');

// Import models
const User = require('./models/User');
const Tenant = require('./models/Tenant');
const Alarm = require('./models/Alarm');
const Asset = require('./models/Asset');
const AuthConfig = require('./models/AuthConfig');
const Branding = require('./models/Branding');
const DateFilter = require('./models/DateFilter');

// Import routes
const authRoutes = require('./routes/auth');
const tenantRoutes = require('./routes/tenants');
const alarmRoutes = require('./routes/alarms');
const assetRoutes = require('./routes/assets');
const authConfigRoutes = require('./routes/authConfig');
const brandingRoutes = require('./routes/branding');

// Import controllers for scheduled jobs
const assetController = require('./controllers/assetController');
const alarmController = require('./controllers/alarmController');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Generate random password
const generateRandomPassword = () => {
  const length = 12;
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return password;
};

// Initialize database and create default admin user if needed
const initDB = async () => {
  try {
    await connectDB();
    // Create data directory if it doesn't exist
    const dataDir = path.join(__dirname, '../data');
    if (!require('fs').existsSync(dataDir)) {
      require('fs').mkdirSync(dataDir, { recursive: true });
    }
    // Sync models
    await sequelize.sync({ alter: true });
    console.log('Database synchronized');

    // Check if admin user exists
    const adminUser = await User.findOne({ where: { role: 'ADMIN' } });
    if (!adminUser) {
      console.log('[INIT] No admin user found, creating default admin user...');
      const adminUsername = 'admin';
      const adminPassword = generateRandomPassword();
      const adminEmail = 'admin@dynatrace-monitor.local';

      const newAdmin = await User.create({
        username: adminUsername,
        email: adminEmail,
        password: adminPassword,
        role: 'ADMIN',
      });

      console.log('\n' + '='.repeat(60));
      console.log('🔐 DEFAULT ADMIN USER CREATED');
      console.log('='.repeat(60));
      console.log(`Username: ${adminUsername}`);
      console.log(`Password: ${adminPassword}`);
      console.log(`Email: ${adminEmail}`);
      console.log('='.repeat(60));
      console.log('⚠️  IMPORTANT: Save these credentials in a secure location!');
      console.log('='.repeat(60) + '\n');
    } else {
      console.log('[INIT] Admin user already exists, skipping creation');
    }

    // Initialize default date filters
    const existingFilters = await DateFilter.count();
    if (existingFilters === 0) {
      console.log('[INIT] Creating default date filters...');
      const defaultFilters = [
        { label: '10 seconds', value: '10s', seconds: 10, order: 1 },
        { label: '30 seconds', value: '30s', seconds: 30, order: 2 },
        { label: '1 minute', value: '60s', seconds: 60, order: 3 },
        { label: '5 minutes', value: '5m', seconds: 300, order: 4 },
      ];
      await DateFilter.bulkCreate(defaultFilters);
      console.log('[INIT] Default date filters created');
    } else {
      console.log('[INIT] Date filters already exist, skipping creation');
    }
  } catch (error) {
    console.error('Database initialization error:', error);
    process.exit(1);
  }
};

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/auth-config', authConfigRoutes);
app.use('/api/branding', brandingRoutes);
app.use('/api/tenants', tenantRoutes);
app.use('/api/alarms', alarmRoutes);
app.use('/api/assets', assetRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date() });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Internal server error', error: err.message });
});

// Scheduled job for 3-minute alarm sync
const scheduleAlarmSync = () => {
  // Run alarm sync every 3 minutes (180000 ms)
  setInterval(async () => {
    try {
      console.log('[SCHEDULED JOB] Starting 3-minute alarm sync at', new Date().toISOString());

      // Create a mock request/response for the controller
      const mockReq = {};
      const mockRes = {
        json: (data) => console.log('[SCHEDULED JOB] Alarm sync result:', data),
        status: (code) => ({
          json: (data) => console.log('[SCHEDULED JOB] Alarm sync error:', code, data)
        })
      };

      await alarmController.syncAlarms(mockReq, mockRes);
      console.log('[SCHEDULED JOB] 3-minute alarm sync completed at', new Date().toISOString());
    } catch (error) {
      console.error('[SCHEDULED JOB] Error during 3-minute alarm sync:', error.message);
    }
  }, 180000); // 3 minutes in milliseconds

  console.log('[SCHEDULED JOB] 3-minute alarm sync job scheduled');
};

// Scheduled job for 30-minute asset sync
const scheduleAssetSync = () => {
  // Run asset sync every 30 minutes (1800000 ms)
  setInterval(async () => {
    try {
      console.log('[SCHEDULED JOB] Starting 30-minute asset sync at', new Date().toISOString());

      // Create a mock request/response for the controller
      const mockReq = {};
      const mockRes = {
        json: (data) => console.log('[SCHEDULED JOB] Asset sync result:', data),
        status: (code) => ({
          json: (data) => console.log('[SCHEDULED JOB] Asset sync error:', code, data)
        })
      };

      await assetController.syncAssets(mockReq, mockRes);
      console.log('[SCHEDULED JOB] 30-minute asset sync completed at', new Date().toISOString());
    } catch (error) {
      console.error('[SCHEDULED JOB] Error during 30-minute asset sync:', error.message);
    }
  }, 1800000); // 30 minutes in milliseconds

  console.log('[SCHEDULED JOB] 30-minute asset sync job scheduled');
};

const PORT = process.env.PORT || 5000;

// Start server
initDB().then(() => {
  // Schedule 3-minute alarm sync
  scheduleAlarmSync();

  // Schedule 30-minute asset sync
  scheduleAssetSync();

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
});

