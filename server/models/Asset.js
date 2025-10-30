const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Asset = sequelize.define(
  'Asset',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    tenantId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    tenantName: DataTypes.STRING,
    dynatraceEntityId: {
      type: DataTypes.STRING,
      unique: true,
      allowNull: false,
    },
    name: DataTypes.STRING,
    type: {
      type: DataTypes.STRING,
      // Removed validation to allow dynamic entity types from Dynatrace
      // Entity types can include: HOST, APPLICATION, SERVICE, DATABASE, CONTAINER, PROCESS_GROUP, CONTAINER_GROUP_INSTANCE, etc.
    },
    status: {
      type: DataTypes.STRING,
      defaultValue: 'UNKNOWN',
      validate: {
        isIn: [['HEALTHY', 'DEGRADED', 'UNAVAILABLE', 'UNKNOWN']],
      },
    },
    tags: DataTypes.JSON,
    properties: DataTypes.JSON,
    lastSeen: DataTypes.DATE,
    metadata: DataTypes.JSON,
  },
  { timestamps: true }
);

module.exports = Asset;

