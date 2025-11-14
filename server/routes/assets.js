const express = require('express');
const assetController = require('../controllers/assetController');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

const router = express.Router();

// Sync all tenants (admin only)
router.post('/sync', authMiddleware, adminMiddleware, assetController.syncAssets);

// Sync specific tenant (admin only) - manual sync for single tenant
router.post('/sync/:tenantId', authMiddleware, adminMiddleware, assetController.syncTenant);

router.get('/', authMiddleware, assetController.getAssets);
router.get('/stats', authMiddleware, assetController.getAssetStats);
router.get('/entity-types', authMiddleware, assetController.getEntityTypes);
router.get('/types', authMiddleware, assetController.getEntityTypes); // Backward compatibility

module.exports = router;

