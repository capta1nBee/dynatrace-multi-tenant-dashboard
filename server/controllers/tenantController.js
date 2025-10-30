const Tenant = require('../models/Tenant');
const Alarm = require('../models/Alarm');
const Asset = require('../models/Asset');
const DynatraceClient = require('../utils/dynatraceClient');
const assetController = require('./assetController');

exports.createTenant = async (req, res) => {
  try {
    console.log('[CREATE TENANT] Creating new tenant...');
    const { name, description, dynatraceEnvironmentId, dynatraceApiToken, dynatraceApiUrl } = req.body;
    console.log(`[CREATE TENANT] Tenant name: ${name}, URL: ${dynatraceApiUrl}`);

    // Test connection
    const client = new DynatraceClient(dynatraceApiUrl, dynatraceApiToken);
    console.log('[CREATE TENANT] Testing Dynatrace connection...');
    const connectionTest = await client.testConnection();
    console.log(`[CREATE TENANT] Connection test result:`, connectionTest);

    if (!connectionTest.success) {
      console.error('[CREATE TENANT] Connection test failed:', connectionTest.error);
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

    console.log(`[CREATE TENANT] Tenant created successfully with ID: ${tenant.id}`);

    // Auto sync assets for the new tenant
    console.log(`[CREATE TENANT] Starting auto sync for new tenant: ${tenant.name}`);
    try {
      const client = new DynatraceClient(tenant.dynatraceApiUrl, tenant.dynatraceApiToken);
      const entities = await client.getEntities();

      if (entities && entities.entities) {
        console.log(`[CREATE TENANT] Found ${entities.entities.length} entities for tenant ${tenant.name}`);

        for (const entity of entities.entities) {
          await Asset.upsert({
            dynatraceEntityId: entity.entityId,
            tenantId: tenant.id,
            tenantName: tenant.name,
            name: entity.displayName || entity.entityId,
            type: entity.entityType || 'UNKNOWN',
            status: 'ACTIVE',
            tags: entity.tags || [],
          });
        }
        console.log(`[CREATE TENANT] Assets synced for tenant: ${tenant.name}`);
      }
    } catch (syncError) {
      console.warn(`[CREATE TENANT] Warning: Could not auto sync assets for tenant ${tenant.name}:`, syncError.message);
      // Don't fail tenant creation if asset sync fails
    }

    res.status(201).json(tenant);
  } catch (error) {
    console.error('[CREATE TENANT] Error:', error.message);
    console.error('[CREATE TENANT] Error stack:', error.stack);
    res.status(500).json({ message: error.message });
  }
};

exports.getTenants = async (req, res) => {
  try {
    console.log('[GET TENANTS] Fetching all tenants (active and inactive)...');
    // Get both active and inactive tenants, sorted by isActive (active first)
    const tenants = await Tenant.findAll({
      order: [['isActive', 'DESC'], ['name', 'ASC']],
    });
    console.log(`[GET TENANTS] Found ${tenants.length} total tenants (${tenants.filter(t => t.isActive).length} active, ${tenants.filter(t => !t.isActive).length} inactive)`);
    res.json(tenants);
  } catch (error) {
    console.error('[GET TENANTS] Error:', error.message);
    res.status(500).json({ message: error.message });
  }
};

exports.getTenant = async (req, res) => {
  try {
    console.log(`[GET TENANT] Fetching tenant with ID: ${req.params.id}`);
    const tenant = await Tenant.findByPk(req.params.id);
    if (!tenant) {
      console.warn(`[GET TENANT] Tenant not found with ID: ${req.params.id}`);
      return res.status(404).json({ message: 'Tenant not found' });
    }
    console.log(`[GET TENANT] Found tenant: ${tenant.name}`);
    res.json(tenant);
  } catch (error) {
    console.error('[GET TENANT] Error:', error.message);
    res.status(500).json({ message: error.message });
  }
};

exports.updateTenant = async (req, res) => {
  try {
    console.log(`[UPDATE TENANT] Updating tenant with ID: ${req.params.id}`);
    console.log(`[UPDATE TENANT] Update data:`, req.body);
    const tenant = await Tenant.findByPk(req.params.id);
    if (!tenant) {
      console.warn(`[UPDATE TENANT] Tenant not found with ID: ${req.params.id}`);
      return res.status(404).json({ message: 'Tenant not found' });
    }
    await tenant.update(req.body);
    console.log(`[UPDATE TENANT] Tenant updated successfully: ${tenant.name}`);
    res.json(tenant);
  } catch (error) {
    console.error('[UPDATE TENANT] Error:', error.message);
    console.error('[UPDATE TENANT] Error stack:', error.stack);
    res.status(500).json({ message: error.message });
  }
};

// Disable/Pasif etme - Tenant'ı pasif yap ama silme
exports.disableTenant = async (req, res) => {
  try {
    console.log(`[DISABLE TENANT] Disabling tenant with ID: ${req.params.id}`);
    const tenant = await Tenant.findByPk(req.params.id);
    if (!tenant) {
      console.warn(`[DISABLE TENANT] Tenant not found with ID: ${req.params.id}`);
      return res.status(404).json({ message: 'Tenant not found' });
    }
    console.log(`[DISABLE TENANT] Found tenant: ${tenant.name}, marking as inactive`);
    await tenant.update({ isActive: false });
    console.log(`[DISABLE TENANT] Tenant marked as inactive: ${tenant.name}`);
    res.json({ message: 'Tenant disabled successfully', tenantId: tenant.id, tenantName: tenant.name });
  } catch (error) {
    console.error('[DISABLE TENANT] Error:', error.message);
    console.error('[DISABLE TENANT] Error stack:', error.stack);
    res.status(500).json({ message: error.message });
  }
};

// Permanent delete - Tenant'ı ve tüm ilişkili verileri sil
exports.deleteTenant = async (req, res) => {
  try {
    console.log(`[DELETE TENANT] Permanently deleting tenant with ID: ${req.params.id}`);
    const tenant = await Tenant.findByPk(req.params.id);
    if (!tenant) {
      console.warn(`[DELETE TENANT] Tenant not found with ID: ${req.params.id}`);
      return res.status(404).json({ message: 'Tenant not found' });
    }

    const tenantName = tenant.name;
    const tenantId = tenant.id;

    // Delete all alarms for this tenant
    console.log(`[DELETE TENANT] Deleting alarms for tenant: ${tenantName}`);
    const alarmsDeleted = await Alarm.destroy({ where: { tenantId } });
    console.log(`[DELETE TENANT] Deleted ${alarmsDeleted} alarms`);

    // Delete all assets for this tenant
    console.log(`[DELETE TENANT] Deleting assets for tenant: ${tenantName}`);
    const assetsDeleted = await Asset.destroy({ where: { tenantId } });
    console.log(`[DELETE TENANT] Deleted ${assetsDeleted} assets`);

    // Delete the tenant itself
    console.log(`[DELETE TENANT] Deleting tenant: ${tenantName}`);
    await tenant.destroy();
    console.log(`[DELETE TENANT] Tenant permanently deleted: ${tenantName}`);

    res.json({
      message: 'Tenant permanently deleted',
      tenantId,
      tenantName,
      alarmsDeleted,
      assetsDeleted,
    });
  } catch (error) {
    console.error('[DELETE TENANT] Error:', error.message);
    console.error('[DELETE TENANT] Error stack:', error.stack);
    res.status(500).json({ message: error.message });
  }
};

