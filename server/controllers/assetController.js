const Asset = require('../models/Asset');
const Tenant = require('../models/Tenant');
const DynatraceClient = require('../utils/dynatraceClient');
const { Op, fn, col } = require('sequelize');

// Normalize entity type to a category
const normalizeEntityType = (entityType) => {
  if (!entityType) return 'OTHER';

  const typeStr = String(entityType).toUpperCase();

  // Map specific entity types to categories
  if (typeStr.includes('HOST')) return 'HOST';
  if (typeStr.includes('APPLICATION')) return 'APPLICATION';
  if (typeStr.includes('SERVICE')) return 'SERVICE';
  if (typeStr.includes('DATABASE')) return 'DATABASE';
  if (typeStr.includes('CONTAINER')) return 'CONTAINER';
  if (typeStr.includes('PROCESS_GROUP')) return 'PROCESS_GROUP';

  // Return the original type if no mapping found
  return entityType;
};

exports.syncAssets = async (req, res) => {
  try {
    console.log('[SYNC ASSETS] Starting asset sync...');
    const tenants = await Tenant.findAll({ where: { isActive: true } });
    console.log(`[SYNC ASSETS] Found ${tenants.length} active tenants`);
    let totalAssets = 0;

    for (const tenant of tenants) {
      try {
        console.log(`[SYNC ASSETS] Syncing assets for tenant: ${tenant.name} (ID: ${tenant.id})`);
        console.log(`[SYNC ASSETS] Dynatrace URL: ${tenant.dynatraceApiUrl}`);

        const client = new DynatraceClient(tenant.dynatraceApiUrl, tenant.dynatraceApiToken);
        console.log(`[SYNC ASSETS] Created Dynatrace client for ${tenant.name}`);

        // Fetch all entity types first
        console.log(`[SYNC ASSETS] Fetching all entity types for tenant ${tenant.name}`);
        const entityTypesResponse = await client.getEntityTypes();
        const entityTypes = entityTypesResponse.types.map(t => t.type);
        console.log(`[SYNC ASSETS] Found ${entityTypes.length} entity types:`, entityTypes);

        // Sync entities for each type
        for (const entityType of entityTypes) {
          try {
            console.log(`[SYNC ASSETS] Syncing entities of type: ${entityType}`);
            const entitiesResponse = await client.getEntitiesByType(entityType);

            if (entitiesResponse && entitiesResponse.length > 0) {
              console.log(`[SYNC ASSETS] Found ${entitiesResponse.length} entities of type ${entityType}`);

              for (const entity of entitiesResponse) {
                console.log(`[SYNC ASSETS] Processing entity: ${entity.entityId} - ${entity.displayName}`);
                console.log(`[SYNC ASSETS] Entity type: ${entity.type}`);

                // Use parsed properties from entity (already processed by parseEntity)
                const properties = entity.properties || {};
               /* console.log(`[SYNC ASSETS] Entity properties:`, {
                  ipAddress: properties.ipAddress,
                  osType: properties.osType,
                  state: properties.state,
                  memoryTotal: properties.memoryTotal,
                }); */

                await Asset.upsert({
                  dynatraceEntityId: entity.entityId,
                  tenantId: tenant.id,
                  tenantName: tenant.name,
                  name: entity.displayName,
                  type: normalizeEntityType(entity.type),
                  status: entity.healthStatus || 'UNKNOWN',
                  tags: entity.tags || [],
                  properties: properties,
                  lastSeen: new Date(),
                  metadata: {
                    icon: entity.icon,
                    managementZones: entity.managementZones,
                    originalType: entity.type, // Store original type for reference
                  },
                });
                totalAssets++;
                console.log(`[SYNC ASSETS] Asset upserted successfully for: ${entity.displayName}`);
              }
            } else {
              console.log(`[SYNC ASSETS] No entities found for type ${entityType}`);
            }
          } catch (error) {
            console.warn(`[SYNC ASSETS] Error syncing entities of type ${entityType}:`, error.message);
          }
        }

        await tenant.update({ lastSyncTime: new Date() });
        console.log(`[SYNC ASSETS] Updated lastSyncTime for tenant ${tenant.name}`);
      } catch (error) {
        console.error(`[SYNC ASSETS] Error syncing assets for tenant ${tenant.name}:`, error.message);
        console.error(`[SYNC ASSETS] Error stack:`, error.stack);
      }
    }

    console.log(`[SYNC ASSETS] Sync completed. Total assets synced: ${totalAssets}`);
    res.json({ message: 'Assets synced', totalAssets });
  } catch (error) {
    console.error('[SYNC ASSETS] Fatal error:', error.message);
    console.error('[SYNC ASSETS] Error stack:', error.stack);
    res.status(500).json({ message: error.message });
  }
};

exports.getAssets = async (req, res) => {
  try {
    console.log('[GET ASSETS] Request received');
    console.log('[GET ASSETS] Query params:', req.query);

    const { tenantId, type, status, search, limit = 10000, skip = 0 } = req.query;
    const where = {};

    if (tenantId) where.tenantId = tenantId;
    // If type is not specified:
    // - If tenantId is provided (dashboard/stats request), get all types
    // - If tenantId is not provided (AssetsList request), default to HOST for performance
    if (type) {
      where.type = type;
    } else if (!tenantId) {
      where.type = 'HOST';
      console.log('[GET ASSETS] No type specified and no tenantId, defaulting to HOST');
    } else {
      console.log('[GET ASSETS] No type specified but tenantId provided, getting all types');
    }
    if (status) where.status = status;
    if (search) where.name = { [Op.like]: `%${search}%` };

    console.log('[GET ASSETS] Where clause:', where);

    const { count, rows } = await Asset.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(skip),
    });

    console.log('[GET ASSETS] Found assets:', count);
    console.log('[GET ASSETS] Returning rows:', rows.length);

    // Format response - only return necessary fields
    const formattedAssets = rows.map(asset => {
      const props = asset.properties || {};

      // Ensure properties are strings, not arrays
      const ipAddress = Array.isArray(props.ipAddress)
        ? props.ipAddress.join(',')
        : (props.ipAddress || 'N/A');

      const macAddresses = Array.isArray(props.macAddresses)
        ? props.macAddresses.join(',')
        : (props.macAddresses || 'N/A');

      return {
        id: asset.id,
        tenantId: asset.tenantId,
        tenantName: asset.tenantName,
        dynatraceEntityId: asset.dynatraceEntityId,
        name: asset.name,
        type: asset.type,
        status: asset.status,
        properties: {
          ipAddress,
          macAddresses,
          osType: props.osType || 'N/A',
          osVersion: props.osVersion || 'N/A',
          osArchitecture: props.osArchitecture || 'N/A',
          state: props.state || 'N/A',
          hypervisorType: props.hypervisorType || 'N/A',
          logicalCpuCores: props.logicalCpuCores || 'N/A',
          memoryTotal: props.memoryTotal || 'N/A',
        },
        lastSeen: asset.lastSeen,
      };
    });

    console.log('[GET ASSETS] First asset formatted:', formattedAssets[0] ? JSON.stringify(formattedAssets[0]).substring(0, 300) : 'No assets');

    res.json({ assets: formattedAssets, total: count });
  } catch (error) {
    console.error('[GET ASSETS] Error:', error.message);
    console.error('[GET ASSETS] Stack:', error.stack);
    res.status(500).json({ message: error.message });
  }
};

exports.getAssetStats = async (req, res) => {
  try {
    console.log('[GET ASSET STATS] Request received');
    const { tenantId } = req.query;
    console.log('[GET ASSET STATS] Query params:', { tenantId });

    const where = {};
    if (tenantId) {
      where.tenantId = parseInt(tenantId);
      console.log('[GET ASSET STATS] Filtering by tenant:', tenantId);
    }

    const stats = await Asset.findAll({
      attributes: ['type', [fn('COUNT', col('id')), 'count']],
      where,
      group: ['type'],
      raw: true,
    });

    console.log('[GET ASSET STATS] Raw stats:', stats);

    const formattedStats = stats.map((stat) => ({
      _id: stat.type,
      count: parseInt(stat.count),
    }));

    console.log('[GET ASSET STATS] Formatted stats:', formattedStats);
    res.json(formattedStats);
  } catch (error) {
    console.error('[GET ASSET STATS] Error:', error.message);
    console.error('[GET ASSET STATS] Stack:', error.stack);
    res.status(500).json({ message: error.message });
  }
};

// Get entity types from Dynatrace
exports.getEntityTypes = async (req, res) => {
  try {
    const { tenantId } = req.query;

    console.log('[GET ENTITY TYPES] Request received');
    console.log('[GET ENTITY TYPES] Tenant ID:', tenantId);

    // Get tenant to verify it exists
    const tenant = await Tenant.findByPk(tenantId);
    if (!tenant) {
      console.error('[GET ENTITY TYPES] Tenant not found:', tenantId);
      return res.status(404).json({ message: 'Tenant not found' });
    }

    // Get distinct entity types from database (much faster than Dynatrace API)
    console.log('[GET ENTITY TYPES] Fetching distinct types from database for tenant:', tenantId);

    const distinctTypes = await Asset.findAll({
      attributes: [[fn('DISTINCT', col('type')), 'type']],
      where: { tenantId: parseInt(tenantId) },
      raw: true,
    });

    const types = distinctTypes
      .map(row => row.type)
      .filter(type => type) // Remove null/empty values
      .sort();

    console.log('[GET ENTITY TYPES] Distinct types from database:', types);

    res.json({
      types: types,
      totalCount: types.length,
    });
  } catch (error) {
    console.error('[GET ENTITY TYPES] Error:', error.message);
    console.error('[GET ENTITY TYPES] Stack:', error.stack);
    res.status(500).json({ message: error.message });
  }
};

