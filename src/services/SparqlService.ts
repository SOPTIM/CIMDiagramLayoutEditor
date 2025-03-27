import type { 
  SparqlResults 
} from '@/core/models/types';
import { SparqlOperationType } from '@/core/models/types';
import { 
  getSparqlUpdateEndpoint, 
  isValidEndpoint 
} from './utils/sparql-utils';

/**
 * Service for handling SPARQL requests
 */
export class SparqlService {
  private endpoint: string;
  private updateEndpoint: string;

  /**
   * Create a new SPARQL service
   * 
   * @param endpoint - SPARQL endpoint URL
   */
  constructor(endpoint: string) {
    this.endpoint = '';
    this.updateEndpoint = '';
    if (endpoint) {
      this.setEndpoint(endpoint);
    }
  }
  
  /**
   * Set the SPARQL endpoint URL
   * 
   * @param endpoint - Endpoint URL
   */
  setEndpoint(endpoint: string): void {
    if (!isValidEndpoint(endpoint)) {
      throw new Error('Invalid SPARQL endpoint URL');
    }
    
    this.endpoint = endpoint;
    this.updateEndpoint = getSparqlUpdateEndpoint(endpoint);
  }
  
  /**
   * Get the current endpoint URL
   * 
   * @returns SPARQL endpoint URL
   */
  getEndpoint(): string {
    return this.endpoint;
  }
  
  /**
   * Get the current update endpoint URL
   * 
   * @returns SPARQL update endpoint URL
   */
  getUpdateEndpoint(): string {
    return this.updateEndpoint;
  }
  
  /**
   * Execute a SPARQL query
   * 
   * @param query - SPARQL query
   * @returns Query results
   */
  async executeQuery(query: string): Promise<SparqlResults> {
    return await this.executeSparql(query, SparqlOperationType.QUERY);
  }
  
  /**
   * Execute a SPARQL update
   * 
   * @param query - SPARQL update query
   * @returns Response
   */
  async executeUpdate(query: string): Promise<Response> {
    return await this.executeSparql(query, SparqlOperationType.UPDATE);
  }
  
  /**
   * Execute a SPARQL operation
   * 
   * @param query - SPARQL query
   * @param type - Operation type (query or update)
   * @returns Query results or response
   */
  private async executeSparql(query: string, type: SparqlOperationType): Promise<any> {
    if (!this.isEndpointConfigured()) {
      throw new Error('SPARQL endpoint not configured');
    }
    
    const endpoint = this.getEndpointForOperationType(type);
    const param = type === SparqlOperationType.QUERY ? 'query' : 'update';
    
    try {
      const response = await this.sendSparqlRequest(endpoint, param, query, type);
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`SPARQL ${type} failed: ${response.status} ${response.statusText}\n${errorText}`);
      }
      
      return type === SparqlOperationType.QUERY ? await response.json() : response;
    } catch (error) {
      this.logSparqlError(error, type, query);
      throw error;
    }
  }
  
  private isEndpointConfigured(): boolean {
    return !!this.endpoint && !!this.updateEndpoint;
  }
  
  private getEndpointForOperationType(type: SparqlOperationType): string {
    return type === SparqlOperationType.QUERY ? this.endpoint : this.updateEndpoint;
  }
  
  private async sendSparqlRequest(
    endpoint: string, 
    paramName: string, 
    query: string, 
    type: SparqlOperationType
  ): Promise<Response> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded'
    };
    
    if (type === SparqlOperationType.QUERY) {
      headers['Accept'] = 'application/sparql-results+json';
    }
    
    return fetch(endpoint, {
      method: 'POST',
      headers,
      body: `${paramName}=${encodeURIComponent(query)}`
    });
  }
  
  private logSparqlError(error: unknown, type: SparqlOperationType, query: string): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    console.error(`SPARQL ${type} error:`, {
      message: errorMessage,
      query: query,
      timestamp: new Date().toISOString()
    });
  }
}

// Create singleton instance for use throughout the application
export const sparqlService = new SparqlService('');