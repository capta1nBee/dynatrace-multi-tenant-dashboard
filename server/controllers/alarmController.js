const Alarm = require('../models/Alarm');
const Tenant = require('../models/Tenant');
const DateFilter = require('../models/DateFilter');
const DynatraceClient = require('../utils/dynatraceClient');
const { Op, fn, col } = require('sequelize');

exports.syncAlarms = async (req, res) => {
  try {
    console.log('[SYNC ALARMS] Starting alarm sync...');
    const { from, to } = req.body || {};

    console.log('[SYNC ALARMS] Date range:', { from, to });

    const tenants = await Tenant.findAll({ where: { isActive: true } });
    console.log(`[SYNC ALARMS] Found ${tenants.length} active tenants`);
    let totalAlarms = 0;

    for (const tenant of tenants) {
      try {
        console.log(`[SYNC ALARMS] Syncing alarms for tenant: ${tenant.name} (ID: ${tenant.id})`);
        console.log(`[SYNC ALARMS] Dynatrace URL: ${tenant.dynatraceApiUrl}`);

        const client = new DynatraceClient(tenant.dynatraceApiUrl, tenant.dynatraceApiToken);
        console.log(`[SYNC ALARMS] Created Dynatrace client for ${tenant.name}`);

        // Build filters with date range
        const filters = {};
        if (from) {
          filters.from = from;
          console.log('[SYNC ALARMS] From date:', from);
        }
        if (to) {
          filters.to = to;
          console.log('[SYNC ALARMS] To date:', to);
        }

        const problemsResponse = await client.getProblems(filters);
        console.log(`[SYNC ALARMS] Received problems response:`, JSON.stringify(problemsResponse).substring(0, 200));

        if (problemsResponse && problemsResponse.problems) {
          console.log(`[SYNC ALARMS] Found ${problemsResponse.problems.length} problems for tenant ${tenant.name}`);

          for (const problem of problemsResponse.problems) {
            console.log(`[SYNC ALARMS] Processing problem: ${problem.problemId} - ${problem.title}`);

            // Extract affected entity name
            const affectedEntity = problem.affectedEntities && problem.affectedEntities.length > 0
              ? problem.affectedEntities[0].name
              : (problem.affectedEntity?.name || 'Unknown');

            const entityType = problem.affectedEntities && problem.affectedEntities.length > 0
              ? problem.affectedEntities[0].entityId?.type
              : (problem.affectedEntity?.entityType || 'UNKNOWN');

            console.log(`[SYNC ALARMS] Affected entity: ${affectedEntity}, Type: ${entityType}`);

            // Check if alarm already exists to detect status changes
            const existingAlarm = await Alarm.findOne({
              where: { dynatraceAlarmId: problem.problemId }
            });

            if (existingAlarm && existingAlarm.status !== problem.status) {
              console.log(`[SYNC ALARMS] ⚠️ STATUS CHANGED for ${problem.problemId}: ${existingAlarm.status} → ${problem.status}`);
            }

            const [alarm, created] = await Alarm.upsert({
              dynatraceAlarmId: problem.problemId,
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

            if (created) {
              console.log(`[SYNC ALARMS] ✅ New alarm created: ${problem.problemId}`);
            } else {
              console.log(`[SYNC ALARMS] 🔄 Alarm updated: ${problem.problemId}`);
            }
            totalAlarms++;
          }
        } else {
          console.log(`[SYNC ALARMS] No problems found for tenant ${tenant.name}`);
        }

        await tenant.update({ lastSyncTime: new Date() });
        console.log(`[SYNC ALARMS] Updated lastSyncTime for tenant ${tenant.name}`);
      } catch (error) {
        console.error(`[SYNC ALARMS] Error syncing alarms for tenant ${tenant.name}:`, error.message);
        console.error(`[SYNC ALARMS] Error stack:`, error.stack);
      }
    }

    console.log(`[SYNC ALARMS] Sync completed. Total alarms synced: ${totalAlarms}`);
    res.json({ message: 'Alarms synced', totalAlarms });
  } catch (error) {
    console.error('[SYNC ALARMS] Fatal error:', error.message);
    console.error('[SYNC ALARMS] Error stack:', error.stack);
    res.status(500).json({ message: error.message });
  }
};

exports.getAlarms = async (req, res) => {
  try {
    console.log('[GET ALARMS] Request received');
    const { tenantId, severity, status, limit, skip = 0, from, to } = req.query;
    console.log('[GET ALARMS] Query params:', { tenantId, severity, status, limit, skip, from, to });

    const where = {};

    if (tenantId) where.tenantId = parseInt(tenantId);
    if (severity) where.severity = severity;
    if (status) where.status = status;

    // Special handling for date range filter:
    // - OPEN alarms: ignore date range (return all OPEN alarms)
    // - CLOSED alarms: apply date range filter to startTime
    if (from || to) {
      console.log('[GET ALARMS] Date range provided:', { from, to });

      if (status === 'CLOSED' || !status) {
        // For CLOSED alarms or when status is not specified, apply date filter
        where.startTime = {};
        if (from) {
          where.startTime[Op.gte] = new Date(from);
          console.log('[GET ALARMS] From date (startTime) for CLOSED:', from);
        }
        if (to) {
          where.startTime[Op.lte] = new Date(to);
          console.log('[GET ALARMS] To date (startTime) for CLOSED:', to);
        }
      } else if (status === 'OPEN') {
        // For OPEN alarms, ignore date range
        console.log('[GET ALARMS] Date range ignored for OPEN alarms');
      }
    }

    console.log('[GET ALARMS] Where clause:', where);

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

    console.log('[GET ALARMS] Found alarms:', count);
    console.log('[GET ALARMS] Returning rows:', rows.length);

    res.json({ alarms: rows, total: count });
  } catch (error) {
    console.error('[GET ALARMS] Error:', error.message);
    console.error('[GET ALARMS] Stack:', error.stack);
    res.status(500).json({ message: error.message });
  }
};

exports.getAlarmStats = async (req, res) => {
  try {
    console.log('[GET ALARM STATS] Request received');
    const { tenantId } = req.query;
    console.log('[GET ALARM STATS] Query params:', { tenantId });

    const where = {};
    if (tenantId) {
      where.tenantId = parseInt(tenantId);
      console.log('[GET ALARM STATS] Filtering by tenant:', tenantId);
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

    console.log('[GET ALARM STATS] Total count:', totalCount);
    console.log('[GET ALARM STATS] Closed count:', closedCount);
    console.log('[GET ALARM STATS] Severity stats:', severityStats);

    const formattedStats = severityStats.map((stat) => ({
      _id: stat.severity,
      count: parseInt(stat.count),
    }));

    // Add Total and Closed stats
    formattedStats.unshift({ _id: 'Total', count: totalCount });
    formattedStats.push({ _id: 'Closed', count: closedCount });

    console.log('[GET ALARM STATS] Formatted stats:', formattedStats);
    res.json(formattedStats);
  } catch (error) {
    console.error('[GET ALARM STATS] Error:', error.message);
    console.error('[GET ALARM STATS] Stack:', error.stack);
    res.status(500).json({ message: error.message });
  }
};

// Get problem details from Dynatrace
exports.getProblemDetails = async (req, res) => {
  try {
    const { problemId } = req.params;
    const { tenantId } = req.query;

    console.log('[GET PROBLEM DETAILS] Request received for problemId:', problemId);
    console.log('[GET PROBLEM DETAILS] Tenant ID:', tenantId);

    // Get tenant to get Dynatrace credentials
    const tenant = await Tenant.findByPk(tenantId);
    if (!tenant) {
      console.error('[GET PROBLEM DETAILS] Tenant not found:', tenantId);
      return res.status(404).json({ message: 'Tenant not found' });
    }

    // Get problem details from Dynatrace
    const client = new DynatraceClient(tenant.dynatraceApiUrl, tenant.dynatraceApiToken);
    const problemDetails = await client.getProblemDetails(problemId);

    console.log('[GET PROBLEM DETAILS] Problem details retrieved successfully');
    res.json(problemDetails);
  } catch (error) {
    console.error('[GET PROBLEM DETAILS] Error:', error.message);
    console.error('[GET PROBLEM DETAILS] Stack:', error.stack);
    res.status(500).json({ message: error.message });
  }
};

exports.getDateFilters = async (req, res) => {
  try {
    console.log('[GET DATE FILTERS] Fetching date filters...');
    const filters = await DateFilter.findAll({
      where: { isActive: true },
      order: [['order', 'ASC']],
    });
    console.log('[GET DATE FILTERS] Found', filters.length, 'date filters');
    res.json(filters);
  } catch (error) {
    console.error('[GET DATE FILTERS] Error:', error.message);
    res.status(500).json({ message: error.message });
  }
};

// Add comment to problem
exports.addComment = async (req, res) => {
  try {
    const { problemId } = req.params;
    const { tenantId } = req.query;
    const { message } = req.body;

    console.log('[ADD COMMENT] Request received for problem:', problemId);
    console.log('[ADD COMMENT] Tenant ID:', tenantId);
    console.log('[ADD COMMENT] Message:', message);

    if (!message) {
      return res.status(400).json({ message: 'Comment message is required' });
    }

    // Get tenant
    const tenant = await Tenant.findByPk(tenantId);
    if (!tenant) {
      console.error('[ADD COMMENT] Tenant not found:', tenantId);
      return res.status(404).json({ message: 'Tenant not found' });
    }

    // Add comment via Dynatrace API
    const client = new DynatraceClient(tenant.dynatraceApiUrl, tenant.dynatraceApiToken);
    const result = await client.addComment(problemId, { message });

    console.log('[ADD COMMENT] Comment added successfully');
    res.status(201).json(result);
  } catch (error) {
    console.error('[ADD COMMENT] Error:', error.message);
    console.error('[ADD COMMENT] Stack:', error.stack);
    res.status(500).json({ message: error.message });
  }
};

// Update comment on problem
exports.updateComment = async (req, res) => {
  try {
    const { problemId, commentId } = req.params;
    const { tenantId } = req.query;
    const { message } = req.body;

    console.log('[UPDATE COMMENT] Request received for problem:', problemId, 'comment:', commentId);
    console.log('[UPDATE COMMENT] Tenant ID:', tenantId);
    console.log('[UPDATE COMMENT] Message:', message);

    if (!message) {
      return res.status(400).json({ message: 'Comment message is required' });
    }

    // Get tenant
    const tenant = await Tenant.findByPk(tenantId);
    if (!tenant) {
      console.error('[UPDATE COMMENT] Tenant not found:', tenantId);
      return res.status(404).json({ message: 'Tenant not found' });
    }

    // Update comment via Dynatrace API
    const client = new DynatraceClient(tenant.dynatraceApiUrl, tenant.dynatraceApiToken);
    const result = await client.updateComment(problemId, commentId, { message });

    console.log('[UPDATE COMMENT] Comment updated successfully');
    res.status(204).json(result);
  } catch (error) {
    console.error('[UPDATE COMMENT] Error:', error.message);
    console.error('[UPDATE COMMENT] Stack:', error.stack);
    res.status(500).json({ message: error.message });
  }
};

// Get comment from problem
exports.getComment = async (req, res) => {
  try {
    const { problemId, commentId } = req.params;
    const { tenantId } = req.query;

    console.log('[GET COMMENT] Request received for problem:', problemId, 'comment:', commentId);
    console.log('[GET COMMENT] Tenant ID:', tenantId);

    // Get tenant
    const tenant = await Tenant.findByPk(tenantId);
    if (!tenant) {
      console.error('[GET COMMENT] Tenant not found:', tenantId);
      return res.status(404).json({ message: 'Tenant not found' });
    }

    // Get comment via Dynatrace API
    const client = new DynatraceClient(tenant.dynatraceApiUrl, tenant.dynatraceApiToken);
    const result = await client.getComment(problemId, commentId);

    console.log('[GET COMMENT] Comment retrieved successfully');
    res.json(result);
  } catch (error) {
    console.error('[GET COMMENT] Error:', error.message);
    console.error('[GET COMMENT] Stack:', error.stack);
    res.status(500).json({ message: error.message });
  }
};

