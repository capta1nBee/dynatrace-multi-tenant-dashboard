const AuthConfig = require('../models/AuthConfig');

exports.getAuthConfig = async (req, res) => {
  try {
    console.log('[GET AUTH CONFIG] Fetching auth configuration...');
    const config = await AuthConfig.findOne({ where: { isActive: true } });
    
    if (!config) {
      console.log('[GET AUTH CONFIG] No active config found, returning LOCAL');
      return res.json({ authType: 'LOCAL' });
    }

    // Don't send sensitive data to frontend
    const safeConfig = {
      id: config.id,
      authType: config.authType,
      oidcDiscoveryUrl: config.oidcDiscoveryUrl,
      oidcClientId: config.oidcClientId,
      oidcRedirectUri: config.oidcRedirectUri,
      oidcScopes: config.oidcScopes,
      ldapServer: config.ldapServer,
      ldapPort: config.ldapPort,
      ldapBaseDn: config.ldapBaseDn,
      ldapBindDn: config.ldapBindDn,
      ldapUserSearchFilter: config.ldapUserSearchFilter,
      ldapLoginAttribute: config.ldapLoginAttribute,
      ldapUseTls: config.ldapUseTls,
    };

    console.log('[GET AUTH CONFIG] Config retrieved:', safeConfig.authType);
    res.json(safeConfig);
  } catch (error) {
    console.error('[GET AUTH CONFIG] Error:', error.message);
    res.status(500).json({ message: error.message });
  }
};

exports.updateAuthConfig = async (req, res) => {
  try {
    console.log('[UPDATE AUTH CONFIG] Updating auth configuration...');
    console.log('[UPDATE AUTH CONFIG] Request body:', JSON.stringify(req.body, null, 2));

    const { authType, oidcClientId, oidcClientSecret, oidcDiscoveryUrl, oidcRedirectUri, oidcScopes, ldapServer, ldapPort, ldapBaseDn, ldapBindDn, ldapBindPassword, ldapUserSearchFilter, ldapLoginAttribute, ldapUseTls } = req.body;

    console.log('[UPDATE AUTH CONFIG] Extracted authType:', authType);
    console.log('[UPDATE AUTH CONFIG] Extracted ldapServer:', ldapServer);

    // Delete all existing configs (not just deactivate)
    await AuthConfig.destroy({ where: {} });

    // Create new config
    const config = await AuthConfig.create({
      authType,
      oidcClientId,
      oidcClientSecret,
      oidcDiscoveryUrl,
      oidcRedirectUri,
      oidcScopes,
      ldapServer,
      ldapPort,
      ldapBaseDn,
      ldapBindDn,
      ldapBindPassword,
      ldapUserSearchFilter,
      ldapLoginAttribute: ldapLoginAttribute || 'uid',
      ldapUseTls,
      isActive: true,
      createdBy: req.user.username,
    });

    console.log('[UPDATE AUTH CONFIG] Config created:', config.authType);
    res.json({ message: 'Auth config updated successfully', config });
  } catch (error) {
    console.error('[UPDATE AUTH CONFIG] Error:', error.message);
    res.status(500).json({ message: error.message });
  }
};

