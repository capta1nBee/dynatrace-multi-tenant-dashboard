const express = require('express');
const alarmController = require('../controllers/alarmController');
const { authMiddleware, monitorMiddleware, optionalAuthMiddleware } = require('../middleware/auth');

const router = express.Router();

// Sync allows optional authentication (public users can also sync with date range)
router.post('/sync', optionalAuthMiddleware, alarmController.syncAlarms);

// GET endpoints allow public access (no auth required)
// Important: Specific routes must come before parameterized routes
router.get('/filters/date', optionalAuthMiddleware, alarmController.getDateFilters);
router.get('/stats', optionalAuthMiddleware, alarmController.getAlarmStats);
router.get('/:problemId/details', optionalAuthMiddleware, alarmController.getProblemDetails);

// Comment endpoints
router.post('/:problemId/comments', optionalAuthMiddleware, alarmController.addComment);
router.put('/:problemId/comments/:commentId', optionalAuthMiddleware, alarmController.updateComment);
router.get('/:problemId/comments/:commentId', optionalAuthMiddleware, alarmController.getComment);

router.get('/', optionalAuthMiddleware, alarmController.getAlarms);

module.exports = router;

