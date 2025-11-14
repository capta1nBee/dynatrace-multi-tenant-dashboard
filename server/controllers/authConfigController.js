const AuthConfig = require('../models/AuthConfig');
const logger = require('../utils/logger');

exports.getAuthConfig = async (req, res) => {
  try {
    logger.debug('GET_AUTH_CONFIG', 'Fetching auth configuration');
    const config = await AuthConfig.findOne({ where: { isActive: true } });
    
    if (!config) {
      logger.debug('GET_AUTH_CONFIG', 'No active config found, returning LOCAL');
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

    logger.debug('GET_AUTH_CONFIG', `Config retrieved: ${safeConfig.authType}`);
    res.json(safeConfig);
  } catch (error) {
    logger.error('GET_AUTH_CONFIG', `Error fetching auth config: ${error.message}`, error);
    res.status(500).json({ message: error.message });
  }
};

exports.updateAuthConfig = async (req, res) => {
  try {
    logger.debug('UPDATE_AUTH_CONFIG', 'Updating auth configuration');

    const { authType, oidcClientId, oidcClientSecret, oidcDiscoveryUrl, oidcRedirectUri, oidcScopes, ldapServer, ldapPort, ldapBaseDn, ldapBindDn, ldapBindPassword, ldapUserSearchFilter, ldapLoginAttribute, ldapUseTls } = req.body;

    logger.debug('UPDATE_AUTH_CONFIG', `Auth type: ${authType}, LDAP server: ${ldapServer || 'N/A'}`);

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

    logger.debug('UPDATE_AUTH_CONFIG', `Config created: ${config.authType}`);
    res.json({ message: 'Auth config updated successfully', config });
  } catch (error) {
    logger.error('UPDATE_AUTH_CONFIG', `Error updating auth config: ${error.message}`, error);
    res.status(500).json({ message: error.message });
  }
};

