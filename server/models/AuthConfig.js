const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const AuthConfig = sequelize.define(
  'AuthConfig',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    authType: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        isIn: [['LOCAL', 'OIDC', 'LDAP']],
      },
      defaultValue: 'LOCAL',
    },
    // OIDC Configuration
    oidcClientId: DataTypes.STRING,
    oidcClientSecret: DataTypes.STRING,
    oidcDiscoveryUrl: DataTypes.STRING,
    oidcRedirectUri: DataTypes.STRING,
    oidcScopes: DataTypes.STRING, // comma-separated: openid,profile,email
    
    // LDAP Configuration
    ldapServer: DataTypes.STRING,
    ldapPort: DataTypes.INTEGER,
    ldapBaseDn: DataTypes.STRING,
    ldapBindDn: DataTypes.STRING,
    ldapBindPassword: DataTypes.STRING,
    ldapUserSearchFilter: DataTypes.STRING,
    ldapLoginAttribute: {
      type: DataTypes.STRING,
      defaultValue: 'uid', // uid, mail, sAMAccountName, etc.
    },
    ldapUseTls: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    
    // Common
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    createdBy: DataTypes.STRING,
  },
  { timestamps: true }
);

module.exports = AuthConfig;

