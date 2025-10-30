const express = require('express');
const authConfigController = require('../controllers/authConfigController');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

const router = express.Router();

// Get auth config (public - needed for login page)
router.get('/', authConfigController.getAuthConfig);

// Update auth config (admin only)
router.put('/', authMiddleware, adminMiddleware, authConfigController.updateAuthConfig);

module.exports = router;

