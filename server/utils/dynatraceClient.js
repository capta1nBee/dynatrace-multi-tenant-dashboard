const axios = require('axios');
const logger = require('./logger');

class DynatraceClient {
  constructor(apiUrl, apiToken) {
    this.apiUrl = apiUrl;
    this.apiToken = apiToken;
    this.client = axios.create({
      baseURL: apiUrl,
      headers: {
        Authorization: `Api-Token ${apiToken}`,
        'Content-Type': 'application/json',
      },
    });
  }

  // Get all problems/alarms with pagination
  async getProblems(filters = {}) {
    try {
      logger.debug('DYNATRACE_CLIENT', 'Fetching problems');

      // baseURL already contains /api/v2, so just add /problems
      const url = '/problems';

      let allProblems = [];
      let nextPageKey = null;
      let pageCount = 0;

      do {
        const params = { ...filters, pageSize: 500 };
        if (nextPageKey) {
          params.nextPageKey = nextPageKey;
        }

        const response = await this.client.get(url, { params });
        logger.debug('DYNATRACE_CLIENT', `Page ${pageCount + 1}: ${response.data?.problems?.length || 0} problems`);

        if (response.data?.problems) {
          allProblems = allProblems.concat(response.data.problems);
        }

        nextPageKey = response.data?.nextPageKey;
        pageCount++;
      } while (nextPageKey);

      logger.debug('DYNATRACE_CLIENT', `Total problems fetched: ${allProblems.length}`);
      return { problems: allProblems, totalCount: allProblems.length };
    } catch (error) {
      logger.error('DYNATRACE_CLIENT', 'Error fetching problems', error);
      throw error;
    }
  }

  // Get all entity types
  async getEntityTypes(filters = {}) {
    try {
      logger.debug('DYNATRACE_CLIENT', 'Fetching entity types');

      let allTypes = [];
      let nextPageKey = null;
      let pageCount = 0;

      do {
        const params = { ...filters, pageSize: 500 };
        if (nextPageKey) {
          params.nextPageKey = nextPageKey;
        }

        const response = await this.client.get('/entityTypes', { params });
        logger.debug('DYNATRACE_CLIENT', `Page ${pageCount + 1}: ${response.data?.types?.length || 0} types`);

        if (response.data?.types) {
          allTypes = allTypes.concat(response.data.types);
        }

        nextPageKey = response.data?.nextPageKey;
        pageCount++;
      } while (nextPageKey);

      logger.debug('DYNATRACE_CLIENT', `Total entity types fetched: ${allTypes.length}`);
      return { types: allTypes, totalCount: allTypes.length };
    } catch (error) {
      logger.error('DYNATRACE_CLIENT', 'Error fetching entity types', error);
      throw error;
    }
  }

  // Get entities (hosts, applications, services, etc.)
  // If entityType is not provided, fetch all entity types
  async getEntities(entityType = null, filters = {}) {
    try {
      let allEntities = [];

      // If no specific entity type provided, get all types first
      if (!entityType) {
        logger.debug('DYNATRACE_CLIENT', 'Fetching all entity types');
        const entityTypesResponse = await this.getEntityTypes();
        const entityTypes = entityTypesResponse.types.map(t => t.type);
        logger.debug('DYNATRACE_CLIENT', `Found ${entityTypes.length} entity types`);

        // Fetch entities for each type
        for (const type of entityTypes) {
          try {
            logger.debug('DYNATRACE_CLIENT', `Fetching entities for type: ${type}`);
            const entities = await this.getEntitiesByType(type, filters);
            if (entities && entities.length > 0) {
              allEntities = allEntities.concat(entities);
              logger.debug('DYNATRACE_CLIENT', `Added ${entities.length} entities of type ${type}`);
            }
          } catch (error) {
            logger.warn('DYNATRACE_CLIENT', `Error fetching entities for type ${type}: ${error.message}`);
          }
        }

        logger.debug('DYNATRACE_CLIENT', `Total entities fetched: ${allEntities.length}`);
        return { entities: allEntities, totalCount: allEntities.length };
      } else {
        // Fetch specific entity type
        logger.debug('DYNATRACE_CLIENT', `Fetching entities for specific type: ${entityType}`);
        const entities = await this.getEntitiesByType(entityType, filters);
        return { entities: entities || [], totalCount: entities?.length || 0 };
      }
    } catch (error) {
      logger.error('DYNATRACE_CLIENT', `Error fetching entities: ${error.message}`, error);
      throw error;
    }
  }

  // Helper method to fetch entities for a specific type
  async getEntitiesByType(entityType, filters = {}) {
    try {
      // Build URL with entitySelector for specific type and include properties
      // baseURL already contains /api/v2, so just add /entities
      let url = `/entities?entitySelector=type(${entityType})&pageSize=1000&fields=properties`;
      logger.debug('DYNATRACE_CLIENT', `Fetching entities from URL: ${this.apiUrl}${url}`);

      const response = await this.client.get(url, { params: filters });

      // Parse and enrich entity data
      if (response.data && response.data.entities) {
        const enrichedEntities = response.data.entities.map(entity => this.parseEntity(entity));
        return enrichedEntities;
      }

      return [];
    } catch (error) {
      logger.error('DYNATRACE_CLIENT', `Error fetching entities for type ${entityType}: ${error.message}`, error);
      throw error;
    }
  }

  // Parse entity data from Dynatrace response
  parseEntity(entity) {
    const props = entity.properties || {};

    // Extract IP addresses - convert array to comma-separated string
    let ipAddress = '';
    if (props.ipAddress && Array.isArray(props.ipAddress)) {
      ipAddress = props.ipAddress.join(',');
    } else if (props['dt.ip_addresses'] && Array.isArray(props['dt.ip_addresses'])) {
      ipAddress = props['dt.ip_addresses'].join(',');
    } else if (props.deviceAddress) {
      ipAddress = props.deviceAddress;
    }

    // Extract MAC addresses - convert array to comma-separated string
    let macAddresses = 'EMPTY';
    if (props.macAddresses && Array.isArray(props.macAddresses)) {
      macAddresses = props.macAddresses.join(',');
    } else if (props.macAddresses) {
      macAddresses = props.macAddresses;
    }

    // Extract OS information
    const osType = props.osType || props.system_contact || 'EMPTY';
    const osVersion = props.osVersion || 'EMPTY';
    const osArchitecture = props.osArchitecture || 'EMPTY';
    const bitness = props.bitness || 'EMPTY';

    // Extract state and hypervisor info
    const state = props.state || 'UNKNOWN';
    const hypervisorType = props.hypervisorType || (props.state ? 'PHYSICAL' : 'UNKNOWN');

    // Extract CPU and memory
    const logicalCpuCores = props.logicalCpuCores || 'EMPTY';
    const memoryTotal = props.memoryTotal ? Math.round(props.memoryTotal / 1024 / 1024 / 1024) : 'EMPTY';

    return {
      entityId: entity.entityId,
      displayName: entity.displayName || props.detectedName || 'Unknown',
      type: entity.type,
      healthStatus: entity.healthStatus || 'UNKNOWN',
      icon: entity.icon,
      managementZones: entity.managementZones,
      tags: entity.tags || [],
      properties: {
        // Parsed and converted properties (priority)
        ipAddress,
        macAddresses,
        osType,
        osVersion,
        osArchitecture,
        bitness,
        state,
        hypervisorType,
        logicalCpuCores,
        memoryTotal,
        // Include other original properties but don't override parsed ones
        ...Object.keys(props).reduce((acc, key) => {
          // Skip keys that we've already parsed and converted
          if (!['ipAddress', 'macAddresses', 'osType', 'osVersion', 'osArchitecture', 'bitness', 'state', 'hypervisorType', 'logicalCpuCores', 'memoryTotal'].includes(key)) {
            acc[key] = props[key];
          }
          return acc;
        }, {}),
      },
    };
  }

  // Get specific entity details
  async getEntityDetails(entityId) {
    try {
      //console.log('[DYNATRACE CLIENT] Fetching entity details for:', entityId);
      const response = await this.client.get(`/entities/${entityId}`);
      //console.log('[DYNATRACE CLIENT] Entity details response status:', response.status);
      return response.data;
    } catch (error) {
      //console.error('[DYNATRACE CLIENT] Error fetching entity details:', error.message);
      //console.error('[DYNATRACE CLIENT] Error response:', error.response?.data);
      throw error;
    }
  }

  // Get problem details with all fields
  async getProblemDetails(problemId) {
    try {
      logger.debug('DYNATRACE_CLIENT', `Fetching problem details for: ${problemId}`);
      // baseURL already contains /api/v2, so just add /problems/{problemId}
      // Include all detail fields: evidenceDetails, impactAnalysis, recentComments
      const params = {
        fields: 'evidenceDetails,impactAnalysis,recentComments'
      };

      const response = await this.client.get(`/problems/${problemId}`, { params });
      logger.debug('DYNATRACE_CLIENT', 'Problem details retrieved successfully');
      return response.data;
    } catch (error) {
      logger.error('DYNATRACE_CLIENT', `Error fetching problem details: ${error.message}`, error);
      throw error;
    }
  }

  // Add comment to problem
  async addComment(problemId, commentData) {
    try {
      logger.debug('DYNATRACE_CLIENT', `Adding comment to problem: ${problemId}`);

      const response = await this.client.post(`/problems/${problemId}/comments`, commentData);
      logger.debug('DYNATRACE_CLIENT', `Comment added successfully`);
      return response.data;
    } catch (error) {
      logger.error('DYNATRACE_CLIENT', `Error adding comment: ${error.message}`, error);
      throw error;
    }
  }

  // Update comment on problem
  async updateComment(problemId, commentId, commentData) {
    try {
      logger.debug('DYNATRACE_CLIENT', `Updating comment: ${commentId} on problem: ${problemId}`);

      const response = await this.client.put(`/problems/${problemId}/comments/${commentId}`, commentData);
      logger.debug('DYNATRACE_CLIENT', `Comment updated successfully`);
      return response.data;
    } catch (error) {
      logger.error('DYNATRACE_CLIENT', `Error updating comment: ${error.message}`, error);
      throw error;
    }
  }

  // Get comment from problem
  async getComment(problemId, commentId) {
    try {
      logger.debug('DYNATRACE_CLIENT', `Getting comment: ${commentId} from problem: ${problemId}`);

      const response = await this.client.get(`/problems/${problemId}/comments/${commentId}`);
      logger.debug('DYNATRACE_CLIENT', `Comment retrieved successfully`);
      return response.data;
    } catch (error) {
      logger.error('DYNATRACE_CLIENT', `Error getting comment: ${error.message}`, error);
      throw error;
    }
  }

  // Test connection
  async testConnection() {
    try {
      logger.debug('DYNATRACE_CLIENT', `Testing connection to: ${this.apiUrl}`);
      const response = await this.client.get('/problems');
      logger.debug('DYNATRACE_CLIENT', 'Connection test successful');
      return { success: true, data: response.data };
    } catch (error) {
      logger.error('DYNATRACE_CLIENT', `Connection test failed: ${error.message}`, error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = DynatraceClient;

