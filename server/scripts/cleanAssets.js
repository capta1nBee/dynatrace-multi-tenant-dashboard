/**
 * Clean Assets Script
 * Eski asset'leri temizle ve yeni sync için hazırla
 */

const { sequelize } = require('../config/database');
const Asset = require('../models/Asset');

async function cleanAssets() {
  try {
    console.log('[CLEAN ASSETS] Starting cleanup...');
    
    // Tüm asset'leri sil
    const deleted = await Asset.destroy({ where: {} });
    console.log(`[CLEAN ASSETS] Deleted ${deleted} old assets`);
    
    // Veritabanını senkronize et
    await sequelize.sync({ force: false });
    console.log('[CLEAN ASSETS] Database synced');
    
    console.log('[CLEAN ASSETS] Cleanup completed successfully!');
    console.log('[CLEAN ASSETS] Now run: npm run dev:server');
    console.log('[CLEAN ASSETS] Then sync assets from frontend');
    
    process.exit(0);
  } catch (error) {
    console.error('[CLEAN ASSETS] Error:', error.message);
    console.error('[CLEAN ASSETS] Stack:', error.stack);
    process.exit(1);
  }
}

cleanAssets();

