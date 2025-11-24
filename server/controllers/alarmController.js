const Alarm = require('../models/Alarm');
const Tenant = require('../models/Tenant');
const DateFilter = require('../models/DateFilter');
const DynatraceClient = require('../utils/dynatraceClient');
const logger = require('../utils/logger');
const { Op, fn, col } = require('sequelize');

exports.syncAlarms = async (req, res) => {
  try {
    const { from, to } = req.body || {};
    logger.info('SYNC_ALARMS', `Starting alarm sync...${from && to ? ` (${from} to ${to})` : ''}`);

    const tenants = await Tenant.findAll({ where: { isActive: true } });
    logger.debug('SYNC_ALARMS', `Found ${tenants.length} active tenants`);
    let totalAlarms = 0;

    for (const tenant of tenants) {
      try {
        logger.debug('SYNC_ALARMS', `Syncing alarms for tenant: ${tenant.name} (ID: ${tenant.id})`);

        const client = new DynatraceClient(tenant.dynatraceApiUrl, tenant.dynatraceApiToken);

        // Build filters with date range
        const filters = {};
        if (from) filters.from = from;
        if (to) filters.to = to;

        const problemsResponse = await client.getProblems(filters);

        if (problemsResponse && problemsResponse.problems) {
          logger.debug('SYNC_ALARMS', `Found ${problemsResponse.problems.length} problems for tenant ${tenant.name}`);

          for (const problem of problemsResponse.problems) {
            logger.debug('SYNC_ALARMS', `Processing problem: ${problem.problemId} - ${problem.title}`);

            // Extract affected entity name
            const affectedEntity = problem.affectedEntities && problem.affectedEntities.length > 0
              ? problem.affectedEntities[0].name
              : (problem.affectedEntity?.name || 'Unknown');

            const entityType = problem.affectedEntities && problem.affectedEntities.length > 0
              ? problem.affectedEntities[0].entityId?.type
              : (problem.affectedEntity?.entityType || 'UNKNOWN');

            // Extract displayId (Dynatrace returns displayId on problem details and often on list)
            const displayId = problem.displayId || problem.displayID || (problem.displayIds && problem.displayIds[0]) || null;

            // Check if alarm already exists to detect status changes
            // Try to match by dynatraceAlarmId first, fallback to displayId (useful if problemId changes but displayId stays)
            const orClause = [{ dynatraceAlarmId: problem.problemId }];
            if (displayId) orClause.push({ displayId });

            const existingAlarm = await Alarm.findOne({
              where: { tenantId: tenant.id, [Op.or]: orClause }
            });

            if (existingAlarm && existingAlarm.status !== problem.status) {
              logger.warn('SYNC_ALARMS', `Status changed for ${displayId || problem.problemId}: ${existingAlarm.status} → ${problem.status}`);
            }

            const [alarm, created] = await Alarm.upsert({
              dynatraceAlarmId: problem.problemId,
              displayId: displayId,
              tenantId: tenant.id,
              tenantName: tenant.name,
              title: problem.title,
              description: problem.title, // Use title as description since API doesn't provide description
              severity: problem.severityLevel,
              status: problem.status,
              affectedEntity: affectedEntity,
              entityType: entityType,
              startTime: new Date(problem.startTime),
              endTime: problem.endTime && problem.endTime > 0 ? new Date(problem.endTime) : null,
              tags: problem.entityTags || [],
            });

            logger.debug('SYNC_ALARMS', `Alarm ${created ? 'created' : 'updated'}: ${problem.problemId}`);
            totalAlarms++;
          }
        } else {
          logger.debug('SYNC_ALARMS', `No problems found for tenant ${tenant.name}`);
        }

        await tenant.update({ lastSyncTime: new Date() });
        logger.debug('SYNC_ALARMS', `Updated lastSyncTime for tenant ${tenant.name}`);
      } catch (error) {
        logger.error('SYNC_ALARMS', `Error syncing alarms for tenant ${tenant.name}`, error);
      }
    }

    logger.info('SYNC_ALARMS', `Sync completed. Total alarms synced: ${totalAlarms}`);
    res.json({ message: 'Alarms synced', totalAlarms });
  } catch (error) {
    logger.error('SYNC_ALARMS', 'Fatal error', error);
    res.status(500).json({ message: error.message });
  }
};

exports.getAlarms = async (req, res) => {
  try {
    const { tenantId, severity, status, limit, skip = 0, from, to } = req.query;
    logger.debug('GET_ALARMS', `Request with params: status=${status}, tenantId=${tenantId}`);

    const where = {};

    if (tenantId) where.tenantId = parseInt(tenantId);
    if (severity) where.severity = severity;
    if (status) where.status = status;

    // Special handling for date range filter:
    // - OPEN alarms: ignore date range (return all OPEN alarms)
    // - CLOSED alarms: apply date range filter to startTime
    if (from || to) {
      logger.debug('GET_ALARMS', `Date range filter applied`);

      if (status === 'CLOSED' || !status) {
        // For CLOSED alarms or when status is not specified, apply date filter
        where.startTime = {};
        if (from) {
          where.startTime[Op.gte] = new Date(from);
        }
        if (to) {
          where.startTime[Op.lte] = new Date(to);
        }
      } else if (status === 'OPEN') {
        // For OPEN alarms, ignore date range
        logger.debug('GET_ALARMS', 'Date range ignored for OPEN alarms');
      }
    }

    const queryOptions = {
      where,
      order: [['createdAt', 'DESC']],
      offset: parseInt(skip),
    };

    // Only add limit if specified
    if (limit) {
      queryOptions.limit = parseInt(limit);
    }

    const { count, rows } = await Alarm.findAndCountAll(queryOptions);

    logger.debug('GET_ALARMS', `Found ${count} alarms, returning ${rows.length}`);
    res.json({ alarms: rows, total: count });
  } catch (error) {
    logger.error('GET_ALARMS', 'Error', error);
    res.status(500).json({ message: error.message });
  }
};

exports.getAlarmStats = async (req, res) => {
  try {
    const { tenantId } = req.query;
    logger.debug('GET_ALARM_STATS', `Request received${tenantId ? ` for tenant ${tenantId}` : ''}`);

    const where = {};
    if (tenantId) {
      where.tenantId = parseInt(tenantId);
    }

    // Get severity-based stats
    const severityStats = await Alarm.findAll({
      attributes: ['severity', [fn('COUNT', col('id')), 'count']],
      where,
      group: ['severity'],
      raw: true,
    });

    // Get Total and Closed counts
    const totalCount = await Alarm.count({ where });
    const closedCount = await Alarm.count({ where: { ...where, status: 'CLOSED' } });

    logger.debug('GET_ALARM_STATS', `Total: ${totalCount}, Closed: ${closedCount}`);

    const formattedStats = severityStats.map((stat) => ({
      _id: stat.severity,
      count: parseInt(stat.count),
    }));

    // Add Total and Closed stats
    formattedStats.unshift({ _id: 'Total', count: totalCount });
    formattedStats.push({ _id: 'Closed', count: closedCount });

    res.json(formattedStats);
  } catch (error) {
    logger.error('GET_ALARM_STATS', 'Error', error);
    res.status(500).json({ message: error.message });
  }
};

// Get problem details from Dynatrace
exports.getProblemDetails = async (req, res) => {
  try {
    const { problemId } = req.params;
    const { tenantId } = req.query;

    logger.debug('GET_PROBLEM_DETAILS', `Request for problemId: ${problemId}`);

    // Get tenant to get Dynatrace credentials
    const tenant = await Tenant.findByPk(tenantId);
    if (!tenant) {
      logger.warn('GET_PROBLEM_DETAILS', `Tenant not found: ${tenantId}`);
      return res.status(404).json({ message: 'Tenant not found' });
    }

    // Get problem details from Dynatrace
    const client = new DynatraceClient(tenant.dynatraceApiUrl, tenant.dynatraceApiToken);
    const problemDetails = await client.getProblemDetails(problemId);

    logger.debug('GET_PROBLEM_DETAILS', 'Problem details retrieved successfully');
    res.json(problemDetails);
  } catch (error) {
    logger.error('GET_PROBLEM_DETAILS', 'Error', error);
    res.status(500).json({ message: error.message });
  }
};

exports.getDateFilters = async (req, res) => {
  try {
    logger.debug('GET_DATE_FILTERS', 'Fetching date filters');
    const filters = await DateFilter.findAll({
      where: { isActive: true },
      order: [['order', 'ASC']],
    });
    logger.debug('GET_DATE_FILTERS', `Found ${filters.length} date filters`);
    res.json(filters);
  } catch (error) {
    logger.error('GET_DATE_FILTERS', 'Error', error);
    res.status(500).json({ message: error.message });
  }
};

// Add comment to problem
exports.addComment = async (req, res) => {
  try {
    const { problemId } = req.params;
    const { tenantId } = req.query;
    const { message } = req.body;

    logger.debug('ADD_COMMENT', `Request for problem: ${problemId}`);

    if (!message) {
      return res.status(400).json({ message: 'Comment message is required' });
    }

    // Get tenant
    const tenant = await Tenant.findByPk(tenantId);
    if (!tenant) {
      logger.warn('ADD_COMMENT', `Tenant not found: ${tenantId}`);
      return res.status(404).json({ message: 'Tenant not found' });
    }

    // Add comment via Dynatrace API
    const client = new DynatraceClient(tenant.dynatraceApiUrl, tenant.dynatraceApiToken);
    const result = await client.addComment(problemId, { message });

    logger.debug('ADD_COMMENT', 'Comment added successfully');
    res.status(201).json(result);
  } catch (error) {
    logger.error('ADD_COMMENT', 'Error', error);
    res.status(500).json({ message: error.message });
  }
};

// Update comment on problem
exports.updateComment = async (req, res) => {
  try {
    const { problemId, commentId } = req.params;
    const { tenantId } = req.query;
    const { message } = req.body;

    logger.debug('UPDATE_COMMENT', `Request for problem: ${problemId}, comment: ${commentId}`);

    if (!message) {
      return res.status(400).json({ message: 'Comment message is required' });
    }

    // Get tenant
    const tenant = await Tenant.findByPk(tenantId);
    if (!tenant) {
      logger.warn('UPDATE_COMMENT', `Tenant not found: ${tenantId}`);
      return res.status(404).json({ message: 'Tenant not found' });
    }

    // Update comment via Dynatrace API
    const client = new DynatraceClient(tenant.dynatraceApiUrl, tenant.dynatraceApiToken);
    const result = await client.updateComment(problemId, commentId, { message });

    logger.debug('UPDATE_COMMENT', 'Comment updated successfully');
    res.status(204).json(result);
  } catch (error) {
    logger.error('UPDATE_COMMENT', 'Error', error);
    res.status(500).json({ message: error.message });
  }
};

// Get comment from problem
exports.getComment = async (req, res) => {
  try {
    const { problemId, commentId } = req.params;
    const { tenantId } = req.query;

    logger.debug('GET_COMMENT', `Request for problem: ${problemId}, comment: ${commentId}`);

    // Get tenant
    const tenant = await Tenant.findByPk(tenantId);
    if (!tenant) {
      logger.warn('GET_COMMENT', `Tenant not found: ${tenantId}`);
      return res.status(404).json({ message: 'Tenant not found' });
    }

    // Get comment via Dynatrace API
    const client = new DynatraceClient(tenant.dynatraceApiUrl, tenant.dynatraceApiToken);
    const result = await client.getComment(problemId, commentId);

    logger.debug('GET_COMMENT', 'Comment retrieved successfully');
    res.json(result);
  } catch (error) {
    logger.error('GET_COMMENT', 'Error', error);
    res.status(500).json({ message: error.message });
  }
};

// Update alarm status by displayId
exports.updateAlarmStatus = async (req, res) => {
  try {
    const { displayId } = req.params;
    const { status, tenantId } = req.body;

    logger.debug('UPDATE_ALARM_STATUS', `Request for displayId: ${displayId}, status: ${status}`);

    if (!status) {
      return res.status(400).json({ message: 'Status is required' });
    }

    const validStatuses = ['OPEN', 'CLOSED', 'RESOLVED', 'ACKNOWLEDGED'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    }

    // Find alarm by displayId and tenantId
    const alarm = await Alarm.findOne({
      where: {
        displayId: displayId,
        tenantId: tenantId
      }
    });

    if (!alarm) {
      logger.warn('UPDATE_ALARM_STATUS', `Alarm not found for displayId: ${displayId}`);
      return res.status(404).json({ message: 'Alarm not found' });
    }

    const oldStatus = alarm.status;
    await alarm.update({ status });

    logger.debug('UPDATE_ALARM_STATUS', `Alarm status updated: ${oldStatus} → ${status} (ID: ${alarm.id})`);

    res.json({
      message: 'Alarm status updated successfully',
      alarm: {
        id: alarm.id,
        displayId: alarm.displayId,
        dynatraceAlarmId: alarm.dynatraceAlarmId,
        previousStatus: oldStatus,
        newStatus: status
      }
    });
  } catch (error) {
    logger.error('UPDATE_ALARM_STATUS', 'Error', error);
    res.status(500).json({ message: error.message });
  }
};

// Check and update status of OPEN alarms from Dynatrace
exports.checkOpenAlarms = async (req, res) => {
  try {
    logger.info('CHECK_OPEN_ALARMS', 'Starting check for OPEN alarms');

    // Find all OPEN alarms in database
    const openAlarms = await Alarm.findAll({
      where: { status: 'OPEN' }
    });

    logger.debug('CHECK_OPEN_ALARMS', `Found ${openAlarms.length} OPEN alarms to check`);

    let updatedCount = 0;
    let errorCount = 0;

    for (const alarm of openAlarms) {
      try {
        // Get tenant info
        const tenant = await Tenant.findByPk(alarm.tenantId);
        if (!tenant || !tenant.isActive) {
          logger.debug('CHECK_OPEN_ALARMS', `Skipping alarm ${alarm.dynatraceAlarmId} - tenant inactive or not found`);
          continue;
        }

        // Query Dynatrace API for current problem status
        const client = new DynatraceClient(tenant.dynatraceApiUrl, tenant.dynatraceApiToken);
        const problemDetails = await client.getProblemDetails(alarm.dynatraceAlarmId);

        // Check if status has changed
        if (problemDetails.status && problemDetails.status !== alarm.status) {
          const oldStatus = alarm.status;
          await alarm.update({
            status: problemDetails.status,
            endTime: problemDetails.endTime && problemDetails.endTime > 0 ? new Date(problemDetails.endTime) : null
          });

          logger.info('CHECK_OPEN_ALARMS', `Status updated for ${alarm.displayId || alarm.dynatraceAlarmId}: ${oldStatus} → ${problemDetails.status}`);
          updatedCount++;
        }
      } catch (error) {
        // Log error but continue with other alarms
        logger.error('CHECK_OPEN_ALARMS', `Error checking alarm ${alarm.dynatraceAlarmId}`, error);
        errorCount++;
      }
    }

    const message = `Check completed. Updated: ${updatedCount}, Errors: ${errorCount}, Total checked: ${openAlarms.length}`;
    logger.info('CHECK_OPEN_ALARMS', message);

    if (res) {
      res.json({
        message,
        updatedCount,
        errorCount,
        totalChecked: openAlarms.length
      });
    }
  } catch (error) {
    logger.error('CHECK_OPEN_ALARMS', 'Fatal error', error);
    if (res) {
      res.status(500).json({ message: error.message });
    }
  }
};
