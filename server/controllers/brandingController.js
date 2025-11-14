const Branding = require('../models/Branding');
const logger = require('../utils/logger');

exports.getBranding = async (req, res) => {
  try {
    logger.debug('GET_BRANDING', 'Fetching branding configuration');
    let branding = await Branding.findOne({ where: { isActive: true } });
    
    if (!branding) {
      logger.debug('GET_BRANDING', 'No active branding found, creating default');
      branding = await Branding.create({
        dashboardTitle: 'Dynatrace Multi-Tenant Monitor',
        primaryColor: '#667eea',
        secondaryColor: '#764ba2',
        isActive: true,
      });
    }

    logger.debug('GET_BRANDING', 'Branding retrieved successfully');
    res.json(branding);
  } catch (error) {
    logger.error('GET_BRANDING', `Error fetching branding: ${error.message}`, error);
    res.status(500).json({ message: error.message });
  }
};

exports.updateBranding = async (req, res) => {
  try {
    logger.debug('UPDATE_BRANDING', 'Updating branding configuration');
    const { dashboardTitle, logoUrl, logoFileName, primaryColor, secondaryColor } = req.body;

    // Find existing active branding
    let branding = await Branding.findOne({ where: { isActive: true } });

    if (branding) {
      // Update existing branding
      logger.debug('UPDATE_BRANDING', 'Updating existing branding record');
      await branding.update({
        dashboardTitle,
        logoUrl,
        logoFileName,
        primaryColor,
        secondaryColor,
        createdBy: req.user.username,
      });
    } else {
      // Create new branding if none exists
      logger.debug('UPDATE_BRANDING', 'Creating new branding record');
      branding = await Branding.create({
        dashboardTitle,
        logoUrl,
        logoFileName,
        primaryColor,
        secondaryColor,
        isActive: true,
        createdBy: req.user.username,
      });
    }

    logger.debug('UPDATE_BRANDING', 'Branding updated successfully');
    res.json({ message: 'Branding updated successfully', branding });
  } catch (error) {
    logger.error('UPDATE_BRANDING', `Error updating branding: ${error.message}`, error);
    res.status(500).json({ message: error.message });
  }
};

