import { environmentConfig } from "../config/EnvironmentConfig";

/**
 * Call Tracking Metrics API Service
 * Handles all interactions with the CallTrackingMetrics API
 */
class CallTrackingService {
  constructor() {
    this.baseUrl = 'https://api.calltrackingmetrics.com/api/v1';
  }

  /**
   * Make authenticated request to CTM API
   */
  async makeRequest(endpoint, accessKey, secretKey, params = {}) {
    try {
      const auth = btoa(`${accessKey}:${secretKey}`);
      const queryString = new URLSearchParams(params).toString();
      const url = `${this.baseUrl}${endpoint}${queryString ? '?' + queryString : ''}`;

      environmentConfig.log('info', `[CTM] Fetching: ${endpoint}`);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`CTM API Error (${response.status}): ${error}`);
      }

      return await response.json();

    } catch (error) {
      environmentConfig.log('error', '[CTM] Request failed:', error);
      throw error;
    }
  }

  /**
   * Fetch call data for date range
   * Returns aggregated metrics by day
   */
  async fetchCallMetrics(accountId, startDate, endDate, accessKey, secretKey) {
    try {
      const allCalls = await this.fetchAllCalls(accountId, startDate, endDate, accessKey, secretKey);

      // Aggregate by date
      const metricsByDate = {};

      allCalls.forEach(call => {
        const date = call.start_time.split('T')[0]; // Extract date part
        
        if (!metricsByDate[date]) {
          metricsByDate[date] = {
            date,
            total_calls: 0,
            answered_calls: 0,
            missed_calls: 0,
            qualified_calls: 0,
            total_duration: 0,
            call_ids: []
          };
        }

        metricsByDate[date].total_calls++;
        metricsByDate[date].call_ids.push(call.id);
        
        // Check if call was answered (talk_time > 0)
        if (call.talk_time && call.talk_time > 0) {
          metricsByDate[date].answered_calls++;
          metricsByDate[date].total_duration += call.talk_time;
        } else {
          metricsByDate[date].missed_calls++;
        }

        // Check if call was qualified (you may need to adjust this logic based on your criteria)
        if (call.sale_status === 'qualified' || call.qualified === true) {
          metricsByDate[date].qualified_calls++;
        }
      });

      // Convert to array and calculate averages
      return Object.values(metricsByDate).map(day => ({
        ...day,
        average_duration: day.answered_calls > 0 
          ? Math.round(day.total_duration / day.answered_calls) 
          : 0,
        answer_rate: day.total_calls > 0 
          ? Math.round((day.answered_calls / day.total_calls) * 100) 
          : 0
      }));

    } catch (error) {
      environmentConfig.log('error', '[CTM] Fetch call metrics error:', error);
      throw error;
    }
  }

  /**
   * Fetch all calls for an account with pagination
   * Based on: GET /accounts/{account_id}/calls.json
   */
  async fetchAllCalls(accountId, startDate, endDate, accessKey, secretKey, filters = {}) {
    try {
      let allCalls = [];
      let currentPage = 1;
      let totalPages = 1;

      // Build query parameters
      const params = {
        page: currentPage,
        per_page: 100, // Max per page
        ...filters
      };

      // Add date filters if provided
      if (startDate) {
        params.start_date = startDate;
      }
      if (endDate) {
        params.end_date = endDate;
      }

      // Fetch all pages
      do {
        params.page = currentPage;
        
        const response = await this.makeRequest(
          `/accounts/${accountId}/calls.json`,
          accessKey,
          secretKey,
          params
        );

        if (response.calls && Array.isArray(response.calls)) {
          allCalls = allCalls.concat(response.calls);
        }

        totalPages = response.total_pages || 1;
        currentPage++;

        environmentConfig.log('info', `[CTM] Fetched page ${currentPage - 1} of ${totalPages}`);

      } while (currentPage <= totalPages);

      environmentConfig.log('info', `[CTM] Total calls fetched: ${allCalls.length}`);

      return allCalls;

    } catch (error) {
      environmentConfig.log('error', '[CTM] Fetch all calls error:', error);
      throw error;
    }
  }

  /**
   * Fetch call logs with detailed information
   * GET /accounts/{account_id}/calls.json
   */
  async fetchCallLogs(accountId, startDate, endDate, accessKey, secretKey, page = 1, perPage = 50) {
    try {
      const params = {
        page,
        per_page: perPage
      };

      if (startDate) params.start_date = startDate;
      if (endDate) params.end_date = endDate;

      const response = await this.makeRequest(
        `/accounts/${accountId}/calls.json`,
        accessKey,
        secretKey,
        params
      );

      // Transform call data to standard format
      const calls = (response.calls || []).map(call => ({
        id: call.id,
        tracking_number: call.tracking_number,
        caller_number: call.caller_number,
        start_time: call.start_time,
        duration: call.duration,
        talk_time: call.talk_time,
        status: call.status,
        qualified: call.sale_status === 'qualified',
        source: call.source,
        medium: call.medium,
        campaign: call.campaign,
        keywords: call.keywords,
        landing_page: call.landing_page,
        referrer: call.referrer,
        recording_url: call.recording,
        transcription: call.transcription
      }));

      return {
        calls,
        pagination: {
          page: response.page,
          per_page: response.per_page,
          total_entries: response.total_entries,
          total_pages: response.total_pages,
          next_page: response.next_page,
          previous_page: response.previous_page
        }
      };

    } catch (error) {
      environmentConfig.log('error', '[CTM] Fetch call logs error:', error);
      throw error;
    }
  }

  /**
   * Fetch call attribution data
   * Returns marketing attribution details for calls
   */
  async fetchCallAttribution(accountId, callId, accessKey, secretKey) {
    try {
      const response = await this.makeRequest(
        `/accounts/${accountId}/calls/${callId}.json`,
        accessKey,
        secretKey
      );

      return {
        call_id: response.id,
        source: response.source,
        medium: response.medium,
        campaign: response.campaign,
        keywords: response.keywords,
        landing_page: response.landing_page,
        referrer: response.referrer,
        gclid: response.gclid,
        utm_source: response.utm_source,
        utm_medium: response.utm_medium,
        utm_campaign: response.utm_campaign,
        utm_content: response.utm_content,
        utm_term: response.utm_term
      };

    } catch (error) {
      environmentConfig.log('error', '[CTM] Fetch call attribution error:', error);
      throw error;
    }
  }

  /**
   * Fetch tracking numbers for account
   * GET /accounts/{account_id}/numbers.json
   */
  async fetchTrackingNumbers(accountId, accessKey, secretKey) {
    try {
      let allNumbers = [];
      let currentPage = 1;
      let totalPages = 1;

      do {
        const response = await this.makeRequest(
          `/accounts/${accountId}/numbers.json`,
          accessKey,
          secretKey,
          { page: currentPage, per_page: 100 }
        );

        if (response.numbers && Array.isArray(response.numbers)) {
          allNumbers = allNumbers.concat(response.numbers);
        }

        totalPages = response.total_pages || 1;
        currentPage++;

      } while (currentPage <= totalPages);

      return allNumbers.map(number => ({
        id: number.id,
        number: number.number,
        name: number.name,
        type: number.tracking_type,
        status: number.status,
        created: number.created,
        pool_id: number.number_pool_id
      }));

    } catch (error) {
      environmentConfig.log('error', '[CTM] Fetch tracking numbers error:', error);
      throw error;
    }
  }

  /**
   * Sync tracking number hierarchy for an account
   * Creates/updates tracking number records in the database
   */
  async syncTrackingNumbers(dataSourceId, organizationId) {
    try {
      // This would be implemented when we have a TrackingNumber entity
      environmentConfig.log('info', '[CTM] Tracking number sync not yet implemented');
      
      return {
        recordsSynced: 0,
        message: 'Tracking number sync coming soon'
      };

    } catch (error) {
      environmentConfig.log('error', '[CTM] Sync tracking numbers error:', error);
      throw error;
    }
  }

  /**
   * Get account information
   * GET /accounts/{account_id}.json
   */
  async fetchAccountInfo(accountId, accessKey, secretKey) {
    try {
      const response = await this.makeRequest(
        `/accounts/${accountId}.json`,
        accessKey,
        secretKey
      );

      return {
        id: response.id,
        name: response.name,
        status: response.status,
        created: response.created,
        updated: response.updated
      };

    } catch (error) {
      environmentConfig.log('error', '[CTM] Fetch account info error:', error);
      throw error;
    }
  }

  /**
   * Test connection to CTM API
   * Verifies credentials and returns account info
   */
  async testConnection(accountId, accessKey, secretKey) {
    try {
      const account = await this.fetchAccountInfo(accountId, accessKey, secretKey);
      
      return {
        success: true,
        account_name: account.name,
        account_status: account.status,
        message: 'Connection successful'
      };

    } catch (error) {
      return {
        success: false,
        message: error.message
      };
    }
  }

  /**
   * Fetch account summary statistics
   * Returns high-level metrics for the account
   */
  async fetchAccountSummary(accountId, accessKey, secretKey, days = 30) {
    try {
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);

      const calls = await this.fetchAllCalls(
        accountId,
        startDate.toISOString().split('T')[0],
        endDate.toISOString().split('T')[0],
        accessKey,
        secretKey
      );

      const totalCalls = calls.length;
      const answeredCalls = calls.filter(c => c.talk_time && c.talk_time > 0).length;
      const missedCalls = totalCalls - answeredCalls;
      const qualifiedCalls = calls.filter(c => c.sale_status === 'qualified').length;

      const totalDuration = calls.reduce((sum, call) => 
        sum + (call.talk_time || 0), 0
      );

      return {
        period_days: days,
        total_calls: totalCalls,
        answered_calls: answeredCalls,
        missed_calls: missedCalls,
        qualified_calls: qualifiedCalls,
        answer_rate: totalCalls > 0 ? Math.round((answeredCalls / totalCalls) * 100) : 0,
        qualification_rate: answeredCalls > 0 ? Math.round((qualifiedCalls / answeredCalls) * 100) : 0,
        average_duration: answeredCalls > 0 ? Math.round(totalDuration / answeredCalls) : 0,
        total_talk_time: totalDuration
      };

    } catch (error) {
      environmentConfig.log('error', '[CTM] Fetch account summary error:', error);
      throw error;
    }
  }
}

export const callTrackingService = new CallTrackingService();