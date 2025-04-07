import { get } from 'svelte/store';
import type { PointModel } from '@/core/models/PointModel';
import { SparqlService } from '@/services/SparqlService';
import { TooltipQueryBuilder } from '@/queries/TooltipQueryBuilder';

// Import state from feature modules
import { cimNamespace } from '../diagram/DiagramState';

export interface DiagramObjectDetails {
  iri: string;
  name: string;
  rotation: number | null;
  offsetX: number | null;
  offsetY: number | null;
  style: {
    iri: string;
    name: string;
  } | null;
}

export interface PointDetails {
  iri: string;
  name: string;
  sequenceNumber: number;
  x: number;
  y: number;
  z: number | null;
}

export interface PointDetailsResponse {
  diagramObject: DiagramObjectDetails;
  point: PointDetails;
}

export class TooltipService {
  constructor(
    private sparqlService: SparqlService,
    private tooltipQueryBuilder: TooltipQueryBuilder
  ) {}
  
  /**
   * Load point data for tooltip display
   */
  async loadPointDetails(point: PointModel): Promise<PointDetailsResponse | null> {
    if (!point) return null;
    
    try {
      // Get current namespace
      const namespace = get(cimNamespace);
      
      // Build query to fetch detailed information for this specific point
      const query = this.tooltipQueryBuilder.buildPointDetailsQuery(point.iri, namespace);
      
      // Execute the query
      const result = await this.sparqlService.executeQuery(query);
      
      // Process the result
      if (result.results.bindings.length > 0) {
        const binding = result.results.bindings[0];
        return {
          diagramObject: {
            iri: binding.diagramObject?.value || '',
            name: binding.objectName?.value || 'Unknown',
            rotation: binding.rotation?.value !== undefined ? parseFloat(binding.rotation.value) : null,
            offsetX: binding.offsetX?.value !== undefined ? parseFloat(binding.offsetX.value) : null,
            offsetY: binding.offsetY?.value !== undefined ? parseFloat(binding.offsetY.value) : null,
            style: binding.style ? {
              iri: binding.style.value || '',
              name: binding.styleName?.value || 'Unknown'
            } : null
          },
          point: {
            iri: point.iri,
            name: binding.pointName?.value || 'Unknown',
            sequenceNumber: point.sequenceNumber,
            x: point.x,
            y: point.y,
            z: binding.zPosition?.value !== undefined ? parseFloat(binding.zPosition.value) : null
          }
        };
      }
      
      // Fallback with basic information if detailed query fails
      return {
        diagramObject: {
          iri: point.parentObject?.iri || '',
          name: 'Unknown',
          rotation: null,
          offsetX: null,
          offsetY: null,
          style: null
        },
        point: {
          iri: point.iri,
          name: 'Unknown',
          sequenceNumber: point.sequenceNumber,
          x: point.x,
          y: point.y,
          z: null
        }
      };
    } catch (error) {
      console.error('Error loading point details:', error);
      throw error;
    }
  }
}