// Supabase JavaScript Client Library
// This is a minimal version for Chrome extensions
// For production, download the full library from https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2

(function(global) {
  'use strict';

  // Simple HTTP client for Supabase REST API
  class SupabaseClient {
    constructor(url, key) {
      this.url = url;
      this.key = key;
      this.headers = {
        'apikey': key,
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      };
    }

    from(table) {
      return new SupabaseTable(this.url, this.headers, table);
    }
  }

  class SupabaseTable {
    constructor(url, headers, table) {
      this.url = url;
      this.headers = headers;
      this.table = table;
    }

    async insert(data) {
      try {
        const response = await fetch(`${this.url}/rest/v1/${this.table}`, {
          method: 'POST',
          headers: this.headers,
          body: JSON.stringify(data)
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        return { data: await response.json(), error: null };
      } catch (error) {
        return { data: null, error };
      }
    }
  }

  // Export for use in background.js
  global.supabase = {
    createClient: (url, key) => new SupabaseClient(url, key)
  };

})(this);