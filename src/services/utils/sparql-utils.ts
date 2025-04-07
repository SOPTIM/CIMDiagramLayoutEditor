/**
 * Utility functions for SPARQL operations
 */

/**
 * Get update endpoint URL from query endpoint
 * 
 * @param endpoint - SPARQL query endpoint
 * @returns SPARQL update endpoint
 */
export function getSparqlUpdateEndpoint(endpoint: string): string {
    if (!endpoint) throw new Error('Invalid endpoint');
    
    // If URL already ends with /update, use it as is
    if (endpoint.endsWith('/update')) {
      return endpoint;
    }
    
    // Otherwise append /update
    return endpoint + (endpoint.endsWith('/') ? 'update' : '/update');
  }
  
  /**
   * Validate that the endpoint is properly formatted
   * 
   * @param url - URL to validate
   * @returns True if URL is valid
   */
  export function isValidEndpoint(url: string): boolean {
    if (!url || url.trim() === '') return false;
    
    try {
      new URL(url);
      return true;
    } catch (e) {
      return false;
    }
  }