const Asset = require('../models/Asset');
const Tenant = require('../models/Tenant');
const DynatraceClient = require('../utils/dynatraceClient');
const logger = require('../utils/logger');
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
    logger.info('SYNC_ASSETS', 'Starting asset sync for all active tenants');
    const tenants = await Tenant.findAll({ where: { isActive: true } });
    logger.debug('SYNC_ASSETS', `Found ${tenants.length} active tenants to sync`);
    let totalAssets = 0;

    for (const tenant of tenants) {
      let tenantAssetCount = 0;
      try {
        logger.info('SYNC_ASSETS', `▶ Starting sync for tenant: ${tenant.name}`);

        const client = new DynatraceClient(tenant.dynatraceApiUrl, tenant.dynatraceApiToken);

        // Fetch all entity types first
        logger.debug('SYNC_ASSETS', `Fetching entity types for tenant ${tenant.name}`);
        const entityTypesResponse = await client.getEntityTypes();
        const entityTypes = entityTypesResponse.types.map(t => t.type);
        logger.debug('SYNC_ASSETS', `Found ${entityTypes.length} entity types`);

        // Sync entities for each type
        for (const entityType of entityTypes) {
          try {
            logger.debug('SYNC_ASSETS', `Syncing entities of type: ${entityType}`);
            const entitiesResponse = await client.getEntitiesByType(entityType);

            if (entitiesResponse && entitiesResponse.length > 0) {
              logger.debug('SYNC_ASSETS', `Found ${entitiesResponse.length} entities of type ${entityType}`);

              for (const entity of entitiesResponse) {
                // Use parsed properties from entity (already processed by parseEntity)
                const properties = entity.properties || {};

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
                tenantAssetCount++;
              }
            } else {
              logger.debug('SYNC_ASSETS', `No entities found for type ${entityType}`);
            }
          } catch (error) {
            logger.warn('SYNC_ASSETS', `Error syncing entities of type ${entityType}: ${error.message}`);
          }
        }

        await tenant.update({ lastSyncTime: new Date() });
        logger.info('SYNC_ASSETS', `✓ Completed sync for tenant: ${tenant.name} | Assets written: ${tenantAssetCount}`);
      } catch (error) {
        logger.error('SYNC_ASSETS', `Error syncing assets for tenant ${tenant.name}: ${error.message}`, error);
      }
    }

    logger.info('SYNC_ASSETS', `✓ Sync completed. Total assets written to database: ${totalAssets}`);
    res.json({ message: 'Assets synced', totalAssets });
  } catch (error) {
    logger.error('SYNC_ASSETS', `Fatal error during asset sync: ${error.message}`, error);
    res.status(500).json({ message: error.message });
  }
};

// Sync assets for a specific tenant (manual sync)
exports.syncTenant = async (req, res) => {
  try {
    const { tenantId } = req.params;
    logger.info('SYNC_TENANT', `▶ Starting manual sync for tenant ID: ${tenantId}`);

    const tenant = await Tenant.findByPk(tenantId);
    if (!tenant) {
      logger.error('SYNC_TENANT', `Tenant not found with ID: ${tenantId}`);
      return res.status(404).json({ message: 'Tenant not found' });
    }

    if (!tenant.isActive) {
      logger.warn('SYNC_TENANT', `Cannot sync inactive tenant: ${tenant.name}`);
      return res.status(400).json({ message: 'Cannot sync inactive tenant. Please enable it first.' });
    }

    let tenantAssetCount = 0;
    try {
      logger.info('SYNC_TENANT', `▶ Starting sync for tenant: ${tenant.name}`);

      const client = new DynatraceClient(tenant.dynatraceApiUrl, tenant.dynatraceApiToken);

      // Fetch all entity types first
      logger.debug('SYNC_TENANT', `Fetching entity types for tenant ${tenant.name}`);
      const entityTypesResponse = await client.getEntityTypes();
      const entityTypes = entityTypesResponse.types.map(t => t.type);
      logger.debug('SYNC_TENANT', `Found ${entityTypes.length} entity types`);

      // Sync entities for each type
      for (const entityType of entityTypes) {
        try {
          logger.debug('SYNC_TENANT', `Syncing entities of type: ${entityType}`);
          const entitiesResponse = await client.getEntitiesByType(entityType);

          if (entitiesResponse && entitiesResponse.length > 0) {
            logger.debug('SYNC_TENANT', `Found ${entitiesResponse.length} entities of type ${entityType}`);

            for (const entity of entitiesResponse) {
              const properties = entity.properties || {};

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
                  originalType: entity.type,
                },
              });
              tenantAssetCount++;
            }
          } else {
            logger.debug('SYNC_TENANT', `No entities found for type ${entityType}`);
          }
        } catch (error) {
          logger.warn('SYNC_TENANT', `Error syncing entities of type ${entityType}: ${error.message}`);
        }
      }

      await tenant.update({ lastSyncTime: new Date() });
      logger.info('SYNC_TENANT', `✓ Completed sync for tenant: ${tenant.name} | Assets written: ${tenantAssetCount}`);
      res.json({ 
        message: 'Tenant assets synced successfully', 
        tenantId: tenant.id,
        tenantName: tenant.name,
        assetsWritten: tenantAssetCount 
      });
    } catch (error) {
      logger.error('SYNC_TENANT', `Error syncing assets for tenant ${tenant.name}: ${error.message}`, error);
      res.status(500).json({ message: error.message });
    }
  } catch (error) {
    logger.error('SYNC_TENANT', `Fatal error during tenant sync: ${error.message}`, error);
    res.status(500).json({ message: error.message });
  }
};

exports.getAssets = async (req, res) => {
  try {
    logger.debug('GET_ASSETS', 'Fetching assets');

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
      logger.debug('GET_ASSETS', 'No type specified, defaulting to HOST');
    } else {
      logger.debug('GET_ASSETS', 'No type specified, getting all types');
    }
    if (status) where.status = status;
    if (search) where.name = { [Op.like]: `%${search}%` };

    const { count, rows } = await Asset.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(skip),
    });

    logger.debug('GET_ASSETS', `Found ${count} assets, returning ${rows.length} rows`);

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

    res.json({ assets: formattedAssets, total: count });
  } catch (error) {
    logger.error('GET_ASSETS', `Error fetching assets: ${error.message}`, error);
    res.status(500).json({ message: error.message });
  }
};

exports.getAssetStats = async (req, res) => {
  try {
    logger.debug('GET_ASSET_STATS', 'Fetching asset statistics');
    const { tenantId } = req.query;

    const where = {};
    if (tenantId) {
      where.tenantId = parseInt(tenantId);
      logger.debug('GET_ASSET_STATS', `Filtering by tenant: ${tenantId}`);
    }

    const stats = await Asset.findAll({
      attributes: ['type', [fn('COUNT', col('id')), 'count']],
      where,
      group: ['type'],
      raw: true,
    });

    const formattedStats = stats.map((stat) => ({
      _id: stat.type,
      count: parseInt(stat.count),
    }));

    logger.debug('GET_ASSET_STATS', `Returning stats for ${formattedStats.length} asset types`);
    res.json(formattedStats);
  } catch (error) {
    logger.error('GET_ASSET_STATS', `Error fetching asset stats: ${error.message}`, error);
    res.status(500).json({ message: error.message });
  }
};

// Get entity types from Dynatrace
exports.getEntityTypes = async (req, res) => {
  try {
    const { tenantId } = req.query;

    logger.debug('GET_ENTITY_TYPES', `Fetching entity types for tenant: ${tenantId}`);

    // Get tenant to verify it exists
    const tenant = await Tenant.findByPk(tenantId);
    if (!tenant) {
      logger.error('GET_ENTITY_TYPES', `Tenant not found: ${tenantId}`);
      return res.status(404).json({ message: 'Tenant not found' });
    }

    // Get distinct entity types from database (much faster than Dynatrace API)
    const distinctTypes = await Asset.findAll({
      attributes: [[fn('DISTINCT', col('type')), 'type']],
      where: { tenantId: parseInt(tenantId) },
      raw: true,
    });

    const types = distinctTypes
      .map(row => row.type)
      .filter(type => type) // Remove null/empty values
      .sort();

    logger.debug('GET_ENTITY_TYPES', `Found ${types.length} distinct entity types`);

    res.json({
      types: types,
      totalCount: types.length,
    });
  } catch (error) {
    logger.error('GET_ENTITY_TYPES', `Error fetching entity types: ${error.message}`, error);
    res.status(500).json({ message: error.message });
  }
};

