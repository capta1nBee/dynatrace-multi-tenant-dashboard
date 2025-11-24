require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { connectDB, sequelize } = require('./config/database');
const logger = require('./utils/logger');

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
    logger.info('INIT', 'Database synchronized');

    // Check if admin user exists
    const adminUser = await User.findOne({ where: { role: 'ADMIN' } });
    if (!adminUser) {
      logger.info('INIT', 'No admin user found, creating default admin user...');
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
      logger.debug('INIT', 'Admin user already exists, skipping creation');
    }

    // Initialize default date filters
    const existingFilters = await DateFilter.count();
    if (existingFilters === 0) {
      logger.info('INIT', 'Creating default date filters...');
      const defaultFilters = [
        { label: '10 seconds', value: '10s', seconds: 10, order: 1 },
        { label: '30 seconds', value: '30s', seconds: 30, order: 2 },
        { label: '1 minute', value: '60s', seconds: 60, order: 3 },
        { label: '5 minutes', value: '5m', seconds: 300, order: 4 },
      ];
      await DateFilter.bulkCreate(defaultFilters);
      logger.info('INIT', 'Default date filters created');
    } else {
      logger.debug('INIT', 'Date filters already exist, skipping creation');
    }
  } catch (error) {
    logger.error('INIT', 'Database initialization error', error);
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
  logger.error('SERVER', 'Unhandled error', err);
  res.status(500).json({ message: 'Internal server error', error: err.message });
});

// Scheduled job for 3-minute alarm sync
const scheduleAlarmSync = () => {
  // Run alarm sync every 3 minutes (180000 ms)
  setInterval(async () => {
    try {
      logger.info('SYNC_ALARMS', 'Starting scheduled 3-minute alarm sync');

      // Create a mock request/response for the controller
      const mockReq = {};
      const mockRes = {
        json: (data) => logger.debug('SYNC_ALARMS', 'Sync result completed'),
        status: (code) => ({
          json: (data) => logger.error('SYNC_ALARMS', `Sync error: ${code}`)
        })
      };

      await alarmController.syncAlarms(mockReq, mockRes);
    } catch (error) {
      logger.error('SYNC_ALARMS', 'Error during scheduled alarm sync', error);
    }
  }, 180000); // 3 minutes in milliseconds

  logger.info('SYNC_ALARMS', '3-minute alarm sync job scheduled');
};

// Scheduled job for 30-minute asset sync
const scheduleAssetSync = () => {
  // Run asset sync every 30 minutes (1800000 ms)
  setInterval(async () => {
    try {
      logger.info('SYNC_ASSETS', 'Starting scheduled 30-minute asset sync');

      // Create a mock request/response for the controller
      const mockReq = {};
      const mockRes = {
        json: (data) => logger.debug('SYNC_ASSETS', 'Sync result completed'),
        status: (code) => ({
          json: (data) => logger.error('SYNC_ASSETS', `Sync error: ${code}`)
        })
      };

      await assetController.syncAssets(mockReq, mockRes);
    } catch (error) {
      logger.error('SYNC_ASSETS', 'Error during scheduled asset sync', error);
    }
  }, 1800000); // 30 minutes in milliseconds

  logger.info('SYNC_ASSETS', '30-minute asset sync job scheduled');
};

// Scheduled job for checking OPEN alarms status
const scheduleOpenAlarmsCheck = () => {
  // Run check every 5 minutes (300000 ms)
  setInterval(async () => {
    try {
      logger.info('CHECK_OPEN_ALARMS', 'Starting scheduled 5-minute OPEN alarms check');

      // Create a mock request/response for the controller
      const mockReq = {};
      const mockRes = {
        json: (data) => logger.debug('CHECK_OPEN_ALARMS', `Check completed: ${JSON.stringify(data)}`),
        status: (code) => ({
          json: (data) => logger.error('CHECK_OPEN_ALARMS', `Check error: ${code}`)
        })
      };

      await alarmController.checkOpenAlarms(mockReq, mockRes);
    } catch (error) {
      logger.error('CHECK_OPEN_ALARMS', 'Error during scheduled OPEN alarms check', error);
    }
  }, 180000); // 5 minutes in milliseconds

  logger.info('CHECK_OPEN_ALARMS', '5-minute OPEN alarms check job scheduled');
};

const PORT = process.env.VITE_SERVER_PORT || 5000;

// Start server
initDB().then(() => {
  // Schedule 3-minute alarm sync
  scheduleAlarmSync();

  // Schedule 30-minute asset sync
  scheduleAssetSync();

  // Schedule 5-minute OPEN alarms check
  scheduleOpenAlarmsCheck();

  app.listen(PORT, '0.0.0.0', () => {
    logger.info('SERVER', `Server running on port ${PORT}`);
  });

});

