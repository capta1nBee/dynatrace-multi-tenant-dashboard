const express = require('express');
const tenantController = require('../controllers/tenantController');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

const router = express.Router();

router.post('/', authMiddleware, adminMiddleware, tenantController.createTenant);
router.get('/', authMiddleware, tenantController.getTenants);
router.get('/:id', authMiddleware, tenantController.getTenant);
router.put('/:id', authMiddleware, adminMiddleware, tenantController.updateTenant);

// Disable tenant (mark as inactive)
router.patch('/:id/disable', authMiddleware, adminMiddleware, tenantController.disableTenant);

// Enable tenant (mark as active)
router.patch('/:id/enable', authMiddleware, adminMiddleware, tenantController.enableTenant);

// Permanently delete tenant (cascade delete alarms and assets)
router.delete('/:id', authMiddleware, adminMiddleware, tenantController.deleteTenant);

module.exports = router;

