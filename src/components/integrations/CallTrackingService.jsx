import { environmentConfig } from "../config/EnvironmentConfig";

/**
 * Call Tracking Metrics Integration Service
 * Implements real CTM API calls for fetching tracking numbers, call logs, and metrics
 */
class CallTrackingService {
  constructor() {
    this.baseUrl = 'https://api.calltrackingmetrics.com/api/v1';
    this.rateLimit = 10; // 10 requests per second
    this.requestQueue = [];
  }

  /**
   * Make authenticated API request to CTM
   */
  async makeRequest(endpoint, accessKey, secretKey, params = {}) {
    try {
      // Build query string
      const queryString = Object.keys(params).length > 0
        ? '?' + new URLSearchParams(params).toString()
        : '';

      const url = `${this.baseUrl}${endpoint}${queryString}`;

      // Create Basic Auth header
      const credentials = btoa(`${accessKey}:${secretKey}`);

      environmentConfig.log('info', `[CallTracking] Fetching: ${url}`);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`CTM API Error (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      return data;

    } catch (error) {
      environmentConfig.log('error', '[CallTracking] API request failed:', error);
      throw error;
    }
  }

  /**
   * Fetch call metrics from CTM for a date range
   * Returns aggregated call data grouped by date
   */
  async fetchCallMetrics(startDate, endDate, accessKey, secretKey, accountId) {
    try {
      environmentConfig.log('info', `[CallTracking] Fetching call metrics for account ${accountId}`);

      // Fetch calls with date filters
      // CTM uses 'start_date' and 'end_date' query parameters
      const calls = await this.fetchAllCalls(accountId, {
        start_date: startDate,
        end_date: endDate
      }, accessKey, secretKey);

      // Aggregate by date
      const metricsByDate = {};

      calls.forEach(call => {
        // Extract date from call start time (ISO format: "2024-01-15T10:30:00Z")
        const callDate = call.start_time ? call.start_time.split('T')[0] : startDate;

        if (!metricsByDate[callDate]) {
          metricsByDate[callDate] = {
            date: callDate,
            total_calls: 0,
            answered_calls: 0,
            missed_calls: 0,
            qualified_calls: 0,
            total_duration: 0,
            average_duration: 0
          };
        }

        // Increment counters
        metricsByDate[callDate].total_calls++;

        // Status can be: "answered", "missed", "voicemail", "abandoned"
        if (call.status === 'answered') {
          metricsByDate[callDate].answered_calls++;
        } else if (call.status === 'missed') {
          metricsByDate[callDate].missed_calls++;
        }

        // Check if qualified (based on duration, tags, or custom field)
        const duration = call.talk_time || call.duration || 0;
        if (duration >= 30) { // Qualified if 30+ seconds
          metricsByDate[callDate].qualified_calls++;
        }

        metricsByDate[callDate].total_duration += duration;
      });

      // Calculate averages
      Object.values(metricsByDate).forEach(metrics => {
        if (metrics.total_calls > 0) {
          metrics.average_duration = Math.round(metrics.total_duration / metrics.total_calls);
        }
      });

      environmentConfig.log('info', `[CallTracking] Aggregated ${calls.length} calls into ${Object.keys(metricsByDate).length} days`);

      return Object.values(metricsByDate);

    } catch (error) {
      environmentConfig.log('error', '[CallTracking] Fetch call metrics error:', error);
      throw error;
    }
  }

  /**
   * Fetch all calls for an account (handles pagination)
   * Endpoint: GET /api/v1/accounts/{account_id}/calls
   */
  async fetchAllCalls(accountId, filters = {}, accessKey, secretKey) {
    try {
      let allCalls = [];
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        const response = await this.makeRequest(
          `/accounts/${accountId}/calls`,
          accessKey,
          secretKey,
          {
            ...filters,
            page: page,
            per_page: 100 // Max per page
          }
        );

        // CTM returns paginated data with structure:
        // { calls: [...], page: 1, total_pages: 5, total_entries: 450 }
        const calls = response.calls || [];
        allCalls = allCalls.concat(calls);

        environmentConfig.log('info', `[CallTracking] Fetched page ${page}/${response.total_pages || 1} (${calls.length} calls)`);

        // Check if there are more pages
        hasMore = response.next_page !== null && page < (response.total_pages || 1);
        page++;

        // Safety limit: don't fetch more than 50 pages (5000 calls)
        if (page > 50) {
          environmentConfig.log('warn', '[CallTracking] Reached page limit, stopping pagination');
          break;
        }
      }

      return allCalls;

    } catch (error) {
      environmentConfig.log('error', '[CallTracking] Fetch all calls error:', error);
      throw error;
    }
  }

  /**
   * Fetch detailed call logs
   * Returns individual call records with full details
   */
  async fetchCallLogs(startDate, endDate, accessKey, secretKey, accountId, filters = {}) {
    try {
      environmentConfig.log('info', `[CallTracking] Fetching call logs for account ${accountId}`);

      const calls = await this.fetchAllCalls(accountId, {
        start_date: startDate,
        end_date: endDate,
        ...filters
      }, accessKey, secretKey);

      // Transform to standard format
      return calls.map(call => ({
        id: call.id,
        tracking_number: call.tracking_number,
        tracking_number_id: call.tracking_number_id,
        caller_number: call.caller,
        dialed_number: call.dialed,
        start_time: call.start_time,
        duration: call.duration || 0,
        talk_time: call.talk_time || 0,
        status: call.status,
        call_type: call.call_type, // inbound/outbound
        source: call.source,
        source_url: call.referrer,
        campaign: call.utm_campaign,
        medium: call.utm_medium,
        keyword: call.keyword,
        recording_url: call.recording,
        voicemail_url: call.voicemail,
        tags: call.tag_list || [],
        custom_fields: call.custom_data || {},
        notes: call.notes,
        lead_status: call.lead_status,
        sale_value: call.sale_value,
        formatted_caller: call.formatted_tracking_number,
        formatted_tracking: call.formatted_tracking_number
      }));

    } catch (error) {
      environmentConfig.log('error', '[CallTracking] Fetch call logs error:', error);
      throw error;
    }
  }

  /**
   * Fetch tracking numbers for an account
   * Endpoint: GET /api/v1/accounts/{account_id}/numbers
   */
  async fetchTrackingNumbers(accountId, accessKey, secretKey) {
    try {
      environmentConfig.log('info', `[CallTracking] Fetching tracking numbers for account ${accountId}`);

      const response = await this.makeRequest(
        `/accounts/${accountId}/numbers`,
        accessKey,
        secretKey
      );

      // CTM returns: { numbers: [...], page: 1, total_pages: 1, ... }
      const numbers = response.numbers || [];

      return numbers.map(number => ({
        id: number.id,
        tracking_number: number.number,
        name: number.name,
        formatted_number: number.formatted_number,
        status: number.status,
        pool_type: number.pool_type, // static/dynamic
        source: number.source,
        receiving_numbers: number.receiving_numbers || [],
        call_flow_id: number.call_flow_id,
        created: number.created,
        updated: number.updated
      }));

    } catch (error) {
      environmentConfig.log('error', '[CallTracking] Fetch tracking numbers error:', error);
      throw error;
    }
  }

  /**
   * Sync tracking numbers hierarchy (for DataSync service)
   */
  async syncTrackingNumbers(dataSourceId, organizationId) {
    try {
      // This would be called by DataSyncService during sync jobs
      // For now, return summary - actual implementation depends on your data storage needs

      environmentConfig.log('info', `[CallTracking] Syncing tracking numbers for data source ${dataSourceId}`);

      // In production, you would:
      // 1. Fetch tracking numbers from CTM
      // 2. Store/update them in your TrackingNumber entity
      // 3. Return sync results

      return {
        recordsSynced: 0,
        recordsCreated: 0,
        recordsUpdated: 0
      };

    } catch (error) {
      environmentConfig.log('error', '[CallTracking] Sync tracking numbers error:', error);
      throw error;
    }
  }

  /**
   * Get call attribution data (source/campaign/keyword)
   */
  async fetchCallAttribution(callId, accountId, accessKey, secretKey) {
    try {
      environmentConfig.log('info', `[CallTracking] Fetching attribution for call ${callId}`);

      // Fetch single call details
      // Endpoint: GET /api/v1/accounts/{account_id}/calls/{call_id}
      const response = await this.makeRequest(
        `/accounts/${accountId}/calls/${callId}`,
        accessKey,
        secretKey
      );

      const call = response;

      return {
        call_id: call.id,
        source: call.source,
        source_url: call.referrer,
        landing_page: call.landing_page,
        utm_source: call.utm_source,
        utm_medium: call.utm_medium,
        utm_campaign: call.utm_campaign,
        utm_term: call.utm_term,
        utm_content: call.utm_content,
        keyword: call.keyword,
        gclid: call.gclid,
        msclkid: call.msclkid,
        fbclid: call.fbclid
      };

    } catch (error) {
      environmentConfig.log('error', '[CallTracking] Fetch call attribution error:', error);
      throw error;
    }
  }

  /**
   * Test connection to CTM API
   */
  async testConnection(accountId, accessKey, secretKey) {
    try {
      environmentConfig.log('info', '[CallTracking] Testing connection...');

      // Try to fetch account info
      const response = await this.makeRequest(
        `/accounts/${accountId}`,
        accessKey,
        secretKey
      );

      if (response && response.id) {
        return {
          success: true,
          account_name: response.name,
          account_id: response.id,
          status: response.status
        };
      }

      return {
        success: false,
        error: 'Unable to verify account'
      };

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Fetch account summary stats
   * Endpoint: GET /api/v1/accounts/{account_id}
   */
  async fetchAccountSummary(accountId, accessKey, secretKey) {
    try {
      const response = await this.makeRequest(
        `/accounts/${accountId}`,
        accessKey,
        secretKey
      );

      return {
        id: response.id,
        name: response.name,
        status: response.status,
        created: response.created,
        updated: response.updated,
        total_numbers: response.total_numbers || 0,
        total_calls: response.total_calls || 0
      };

    } catch (error) {
      environmentConfig.log('error', '[CallTracking] Fetch account summary error:', error);
      throw error;
    }
  }
}

export const callTrackingService = new CallTrackingService();