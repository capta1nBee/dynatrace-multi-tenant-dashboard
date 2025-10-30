const express = require('express');
const brandingController = require('../controllers/brandingController');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

const router = express.Router();

// Get branding (public - needed for dashboard)
router.get('/', brandingController.getBranding);

// Update branding (admin only)
router.put('/', authMiddleware, adminMiddleware, brandingController.updateBranding);

module.exports = router;

