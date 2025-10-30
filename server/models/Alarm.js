const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Alarm = sequelize.define(
  'Alarm',
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
    dynatraceAlarmId: {
      type: DataTypes.STRING,
      unique: true,
      allowNull: false,
    },
    title: DataTypes.STRING,
    description: DataTypes.TEXT,
    severity: {
      type: DataTypes.STRING,
      validate: {
        isIn: [['CRITICAL', 'MAJOR', 'MINOR', 'WARNING', 'INFO', 'ERROR', 'RESOURCE_CONTENTION', 'AVAILABILITY', 'PERFORMANCE', 'CUSTOM_ALERT']],
      },
    },
    status: {
      type: DataTypes.STRING,
      defaultValue: 'OPEN',
      validate: {
        isIn: [['OPEN', 'CLOSED', 'RESOLVED', 'ACKNOWLEDGED']],
      },
    },
    affectedEntity: DataTypes.STRING,
    entityType: DataTypes.STRING,
    startTime: DataTypes.DATE,
    endTime: DataTypes.DATE,
    tags: DataTypes.JSON,
    acknowledged: DataTypes.BOOLEAN,
    acknowledgedBy: DataTypes.STRING,
    acknowledgedAt: DataTypes.DATE,
  },
  { timestamps: true }
);

module.exports = Alarm;

