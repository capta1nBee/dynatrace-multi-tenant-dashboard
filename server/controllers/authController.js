const jwt = require('jsonwebtoken');
const User = require('../models/User');
const AuthConfig = require('../models/AuthConfig');
const { Op } = require('sequelize');
const ldap = require('ldapjs');
const iconv = require('iconv-lite');

const generateToken = (user) => {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE }
  );
};

exports.register = async (req, res) => {
  try {
    console.log('[AUTH] Registering new user...');
    const { username, email, password, role } = req.body;
    console.log(`[AUTH] Username: ${username}, Email: ${email}, Role: ${role}`);

    const existingUser = await User.findOne({
      where: {
        [Op.or]: [{ username }, { email }],
      },
    });
    if (existingUser) {
      console.warn(`[AUTH] User already exists: ${username}`);
      return res.status(400).json({ message: 'User already exists' });
    }

    const user = await User.create({ username, email, password, role });
    console.log(`[AUTH] User created successfully with ID: ${user.id}`);

    const token = generateToken(user);
    res.status(201).json({ token, user: { id: user.id, username, email, role } });
  } catch (error) {
    console.error('[AUTH] Registration error:', error.message);
    console.error('[AUTH] Error stack:', error.stack);
    res.status(500).json({ message: error.message });
  }
};

function decodeLdapEscaped(str) {
  return str.replace(/\\([0-9A-Fa-f]{2})/g, (_, hex) =>
    Buffer.from(hex, 'hex').toString('utf8')
  );
}

// LDAP authentication helper
const authenticateWithLDAP = (config, username, password) => {
  return new Promise((resolve, reject) => {
    const client = ldap.createClient({
      url: `ldap://${config.ldapServer}:${config.ldapPort}`,
      tlsOptions: config.ldapUseTls ? { rejectUnauthorized: false } : undefined,
    });

    client.on('error', (err) => {
      console.error('[AUTH LDAP] Connection error:', err.message);
      reject(err);
    });

    // Bind with service account
    client.bind(config.ldapBindDn, config.ldapBindPassword, (err) => {
      if (err) {
        console.error('[AUTH LDAP] Bind error:', err.message);
        client.unbind();
        return reject(err);
      }

      // Search for user
      // ldapUserSearchFilter can be either:
      // 1. Simple: "(uid={0})" - will be replaced with username
      // 2. Complex: "(objectClass=person)" - will be combined with login attribute
      let searchFilter;
      if (config.ldapUserSearchFilter.includes('{0}')) {
        // Simple filter with placeholder
        searchFilter = config.ldapUserSearchFilter.replace('{0}', username);
      } else {
        // Complex filter - combine with login attribute
        searchFilter = `(&(${config.ldapLoginAttribute}=${username})${config.ldapUserSearchFilter})`;
      }
      console.log('[AUTH LDAP] Search filter:', searchFilter);

      client.search(config.ldapBaseDn, { filter: searchFilter, scope: 'sub' ,attributes: ['dn', 'cn', 'mail', 'userPrincipalName'] }, (err, res) => {
        if (err) {
          console.error('[AUTH LDAP] Search error:', err.message);
          client.unbind();
          return reject(err);
        }

        let userDn = null;
        res.on('searchEntry', (entry) => {
          
          let userPrincipalName = null;

            if (entry.attributes) {
              const userPrincipalNameAttr = entry.attributes.find(attr => attr.type === 'userPrincipalName');
              if (userPrincipalNameAttr) {
                userPrincipalName = userPrincipalNameAttr.vals && userPrincipalNameAttr.vals.length > 0 ? userPrincipalNameAttr.vals[0] : null;
              }
            }


          userDn = userPrincipalName;
          console.log('[AUTH LDAP2] User found:', userDn);
        });

        res.on('error', (err) => {
          console.error('[AUTH LDAP] Search result error:', err.message);
          client.unbind();
          reject(err);
        });

        res.on('end', () => {
          console.log('[AUTH LDAP3] User found:', userDn);
          if (!userDn) {
            console.warn('[AUTH LDAP] User not found:', username);
            client.unbind();
            return reject(new Error('User not found'));
          }

          // Try to bind with user credentials
          client.bind(userDn, password, (err) => {
            client.unbind();
            if (err) {
              console.warn('[AUTH LDAP] Invalid password for user:', username);
              return reject(err);
            }
            console.log('[AUTH LDAP] User authenticated successfully:', username);
            resolve({ username, dn: userDn });
          });
        });
      });
    });
  });
};

exports.login = async (req, res) => {
  try {
    console.log('[AUTH] Login attempt...');
    const { username, password } = req.body;
    console.log(`[AUTH] Username: ${username}`);

    // Get auth config
    const authConfig = await AuthConfig.findOne({ where: { isActive: true } });
    const authType = authConfig?.authType || 'LOCAL';
    console.log(`[AUTH] Auth type: ${authType}`);

    let authSuccess = false;
    let authMethod = '';

    // Try LOCAL authentication first (for admin users and local accounts)
    console.log('[AUTH] Attempting LOCAL authentication...');
    const localUser = await User.findOne({ where: { username } });
    if (localUser) {
      const isPasswordValid = await localUser.comparePassword(password);
      if (isPasswordValid) {
        console.log(`[AUTH] ✓ LOCAL authentication successful for user: ${username}`);
        authSuccess = true;
        authMethod = 'LOCAL';
      } else {
        console.warn(`[AUTH] ✗ LOCAL authentication failed - Invalid password for user: ${username}`);
      }
    } else {
      console.log(`[AUTH] ✗ LOCAL authentication failed - User not found in database: ${username}`);
    }

    // If LOCAL auth failed and auth type is not LOCAL, try configured auth method
    if (!authSuccess && authType !== 'LOCAL') {
      if (authType === 'LDAP') {
        try {
          console.log('[AUTH] Attempting LDAP authentication...');
          await authenticateWithLDAP(authConfig, username, password);
          console.log('[AUTH] ✓ LDAP authentication successful');
          authSuccess = true;
          authMethod = 'LDAP';
        } catch (ldapError) {
          console.error('[AUTH] ✗ LDAP authentication failed:', ldapError.message);
        }
      } else if (authType === 'OIDC') {
        console.log('[AUTH] OIDC authentication requires special handling (not implemented in this flow)');
      }
    }

    // If authentication failed, return error
    if (!authSuccess) {
      console.warn(`[AUTH] ✗ Authentication failed for user: ${username}`);
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Find or create user in database
    let user = await User.findOne({ where: { username } });
    if (!user) {
      console.log(`[AUTH] Creating new user from ${authMethod}: ${username}`);
      user = await User.create({
        username,
        email: `${username}@${authMethod.toLowerCase()}.local`,
        password: authMethod === 'LOCAL' ? password : 'external-auth', // Dummy password for external auth users
        role: 'MONITOR', // Default role for new users
      });
    } else {
      console.log(`[AUTH] User found in database: ${username}, role: ${user.role}`);
    }

    const token = generateToken(user);
    console.log(`[AUTH] ✓ Login successful for user: ${username}, role: ${user.role}, method: ${authMethod}`);
    res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
  } catch (error) {
    console.error('[AUTH] Login error:', error.message);
    console.error('[AUTH] Error stack:', error.stack);
    res.status(500).json({ message: error.message });
  }
};

exports.getProfile = async (req, res) => {
  try {
    console.log(`[AUTH] Getting profile for user ID: ${req.user.id}`);
    const user = await User.findByPk(req.user.id);
    console.log(`[AUTH] Profile retrieved for user: ${user.username}`);
    res.json(user);
  } catch (error) {
    console.error('[AUTH] Get profile error:', error.message);
    res.status(500).json({ message: error.message });
  }
};

