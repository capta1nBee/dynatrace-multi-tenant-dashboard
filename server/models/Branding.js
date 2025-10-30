const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Branding = sequelize.define(
  'Branding',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    dashboardTitle: {
      type: DataTypes.STRING,
      defaultValue: 'Dynatrace Multi-Tenant Monitor',
    },
    logoUrl: DataTypes.TEXT, // Base64 encoded image or URL
    logoFileName: DataTypes.STRING,
    primaryColor: {
      type: DataTypes.STRING,
      defaultValue: '#667eea',
    },
    secondaryColor: {
      type: DataTypes.STRING,
      defaultValue: '#764ba2',
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    createdBy: DataTypes.STRING,
  },
  { timestamps: true }
);

module.exports = Branding;

