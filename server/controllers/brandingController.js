const Branding = require('../models/Branding');

exports.getBranding = async (req, res) => {
  try {
    console.log('[GET BRANDING] Fetching branding configuration...');
    let branding = await Branding.findOne({ where: { isActive: true } });
    
    if (!branding) {
      console.log('[GET BRANDING] No active branding found, creating default');
      branding = await Branding.create({
        dashboardTitle: 'Dynatrace Multi-Tenant Monitor',
        primaryColor: '#667eea',
        secondaryColor: '#764ba2',
        isActive: true,
      });
    }

    console.log('[GET BRANDING] Branding retrieved');
    res.json(branding);
  } catch (error) {
    console.error('[GET BRANDING] Error:', error.message);
    res.status(500).json({ message: error.message });
  }
};

exports.updateBranding = async (req, res) => {
  try {
    console.log('[UPDATE BRANDING] Updating branding configuration...');
    const { dashboardTitle, logoUrl, logoFileName, primaryColor, secondaryColor } = req.body;

    // Find existing active branding
    let branding = await Branding.findOne({ where: { isActive: true } });

    if (branding) {
      // Update existing branding
      console.log('[UPDATE BRANDING] Updating existing branding record');
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
      console.log('[UPDATE BRANDING] No existing branding found, creating new one');
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

    console.log('[UPDATE BRANDING] Branding updated successfully');
    res.json({ message: 'Branding updated successfully', branding });
  } catch (error) {
    console.error('[UPDATE BRANDING] Error:', error.message);
    res.status(500).json({ message: error.message });
  }
};

