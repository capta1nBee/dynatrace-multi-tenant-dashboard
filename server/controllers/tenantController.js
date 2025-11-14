const Tenant = require('../models/Tenant');
const Alarm = require('../models/Alarm');
const Asset = require('../models/Asset');
const DynatraceClient = require('../utils/dynatraceClient');
const logger = require('../utils/logger');

exports.createTenant = async (req, res) => {
  try {
    logger.debug('CREATE_TENANT', 'Creating new tenant');
    const { name, description, dynatraceEnvironmentId, dynatraceApiToken, dynatraceApiUrl } = req.body;

    // Test connection
    const client = new DynatraceClient(dynatraceApiUrl, dynatraceApiToken);
    logger.debug('CREATE_TENANT', 'Testing Dynatrace connection');
    const connectionTest = await client.testConnection();

    if (!connectionTest.success) {
      logger.error('CREATE_TENANT', `Connection test failed: ${connectionTest.error}`);
      return res.status(400).json({ message: 'Failed to connect to Dynatrace', error: connectionTest.error });
    }

    const tenant = await Tenant.create({
      name,
      description,
      dynatraceEnvironmentId,
      dynatraceApiToken,
      dynatraceApiUrl,
      createdBy: req.user.username,
    });

    logger.info('CREATE_TENANT', `Tenant created successfully: ${tenant.name} (ID: ${tenant.id})`);

    // Auto sync assets for ONLY the new tenant
    try {
      const client = new DynatraceClient(tenant.dynatraceApiUrl, tenant.dynatraceApiToken);
      logger.debug('CREATE_TENANT', `Fetching entities for new tenant: ${tenant.name}`);
      const entities = await client.getEntities();

      if (entities && entities.entities) {
        logger.debug('CREATE_TENANT', `Found ${entities.entities.length} entities for tenant ${tenant.name}`);

        for (const entity of entities.entities) {
          await Asset.upsert({
            dynatraceEntityId: entity.entityId,
            tenantId: tenant.id,  // ONLY this tenant's ID
            tenantName: tenant.name,  // ONLY this tenant's name
            name: entity.displayName || entity.entityId,
            type: entity.entityType || 'UNKNOWN',
            status: 'ACTIVE',
            tags: entity.tags || [],
          });
        }
        logger.debug('CREATE_TENANT', `Assets synced for new tenant: ${entities.entities.length} assets saved`);
      }
    } catch (syncError) {
      logger.warn('CREATE_TENANT', `Could not auto sync assets for tenant ${tenant.name}: ${syncError.message}`);
      // Don't fail tenant creation if asset sync fails
    }

    res.status(201).json(tenant);
  } catch (error) {
    logger.error('CREATE_TENANT', `Error creating tenant: ${error.message}`, error);
    res.status(500).json({ message: error.message });
  }
};

exports.getTenants = async (req, res) => {
  try {
    logger.debug('GET_TENANTS', 'Fetching all tenants');
    // Get both active and inactive tenants, sorted by isActive (active first)
    const tenants = await Tenant.findAll({
      order: [['isActive', 'DESC'], ['name', 'ASC']],
    });
    logger.debug('GET_TENANTS', `Found ${tenants.length} total tenants`);
    res.json(tenants);
  } catch (error) {
    logger.error('GET_TENANTS', `Error fetching tenants: ${error.message}`, error);
    res.status(500).json({ message: error.message });
  }
};

exports.getTenant = async (req, res) => {
  try {
    logger.debug('GET_TENANT', `Fetching tenant with ID: ${req.params.id}`);
    const tenant = await Tenant.findByPk(req.params.id);
    if (!tenant) {
      logger.debug('GET_TENANT', `Tenant not found with ID: ${req.params.id}`);
      return res.status(404).json({ message: 'Tenant not found' });
    }
    logger.debug('GET_TENANT', `Found tenant: ${tenant.name}`);
    res.json(tenant);
  } catch (error) {
    logger.error('GET_TENANT', `Error fetching tenant: ${error.message}`, error);
    res.status(500).json({ message: error.message });
  }
};

exports.updateTenant = async (req, res) => {
  try {
    logger.debug('UPDATE_TENANT', `Updating tenant with ID: ${req.params.id}`);
    const tenant = await Tenant.findByPk(req.params.id);
    if (!tenant) {
      logger.debug('UPDATE_TENANT', `Tenant not found with ID: ${req.params.id}`);
      return res.status(404).json({ message: 'Tenant not found' });
    }
    await tenant.update(req.body);
    logger.debug('UPDATE_TENANT', `Tenant updated successfully: ${tenant.name}`);
    res.json(tenant);
  } catch (error) {
    logger.error('UPDATE_TENANT', `Error updating tenant: ${error.message}`, error);
    res.status(500).json({ message: error.message });
  }
};

// Disable/Pasif etme - Tenant'ı pasif yap ama silme
exports.disableTenant = async (req, res) => {
  try {
    logger.debug('DISABLE_TENANT', `Disabling tenant with ID: ${req.params.id}`);
    const tenant = await Tenant.findByPk(req.params.id);
    if (!tenant) {
      logger.debug('DISABLE_TENANT', `Tenant not found with ID: ${req.params.id}`);
      return res.status(404).json({ message: 'Tenant not found' });
    }
    logger.debug('DISABLE_TENANT', `Marking tenant as inactive: ${tenant.name}`);
    await tenant.update({ isActive: false });
    logger.debug('DISABLE_TENANT', `Tenant marked as inactive: ${tenant.name}`);
    res.json({ message: 'Tenant disabled successfully', tenantId: tenant.id, tenantName: tenant.name });
  } catch (error) {
    logger.error('DISABLE_TENANT', `Error disabling tenant: ${error.message}`, error);
    res.status(500).json({ message: error.message });
  }
};

// Permanent delete - Tenant'ı ve tüm ilişkili verileri sil
exports.deleteTenant = async (req, res) => {
  try {
    logger.debug('DELETE_TENANT', `Permanently deleting tenant with ID: ${req.params.id}`);
    const tenant = await Tenant.findByPk(req.params.id);
    if (!tenant) {
      logger.debug('DELETE_TENANT', `Tenant not found with ID: ${req.params.id}`);
      return res.status(404).json({ message: 'Tenant not found' });
    }

    const tenantName = tenant.name;
    const tenantId = tenant.id;

    // Delete all alarms for this tenant
    logger.debug('DELETE_TENANT', `Deleting alarms for tenant: ${tenantName}`);
    const alarmsDeleted = await Alarm.destroy({ where: { tenantId } });
    logger.debug('DELETE_TENANT', `Deleted ${alarmsDeleted} alarms`);

    // Delete all assets for this tenant
    logger.debug('DELETE_TENANT', `Deleting assets for tenant: ${tenantName}`);
    const assetsDeleted = await Asset.destroy({ where: { tenantId } });
    logger.debug('DELETE_TENANT', `Deleted ${assetsDeleted} assets`);

    // Delete the tenant itself
    logger.debug('DELETE_TENANT', `Deleting tenant: ${tenantName}`);
    await tenant.destroy();
    logger.info('DELETE_TENANT', `Tenant permanently deleted: ${tenantName}`);

    res.json({
      message: 'Tenant permanently deleted',
      tenantId,
      tenantName,
      alarmsDeleted,
      assetsDeleted,
    });
  } catch (error) {
    logger.error('DELETE_TENANT', `Error deleting tenant: ${error.message}`, error);
    res.status(500).json({ message: error.message });
  }
};

