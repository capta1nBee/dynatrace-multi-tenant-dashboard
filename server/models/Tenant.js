const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Tenant = sequelize.define(
  'Tenant',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    description: DataTypes.TEXT,
    dynatraceEnvironmentId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    dynatraceApiToken: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    dynatraceApiUrl: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    dynatraceUrlType: {
      type: DataTypes.ENUM('standard', 'custom'),
      defaultValue: 'standard',
      comment: 'standard: /e/<environmentId>/api/v2 otomatik eklenir, custom: yazılan URL olduğu gibi kullanılır'
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    lastSyncTime: DataTypes.DATE,
    createdBy: DataTypes.STRING,
  },
  { timestamps: true }
);

module.exports = Tenant;

