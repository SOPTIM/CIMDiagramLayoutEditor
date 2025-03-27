import type { PointModel } from './PointModel';

/**
 * Model class for diagram object glue points
 */
export class GluePointModel {
  iri: string;
  connectedPoints: Set<string>; // Set of point IRIs that are connected by this glue point

  /**
   * Create a new glue point
   * 
   * @param iri - Glue point IRI
   * @param pointIris - Array of point IRIs that are connected by this glue point
   */
  constructor(iri: string, pointIris: string[] = []) {
    this.iri = iri;
    this.connectedPoints = new Set<string>(pointIris);
  }

  /**
   * Add a point to this glue point
   * 
   * @param pointIri - Point IRI to add
   */
  addPoint(pointIri: string): void {
    this.connectedPoints.add(pointIri);
  }

  /**
   * Remove a point from this glue point
   * 
   * @param pointIri - Point IRI to remove
   * @returns True if the glue point should be deleted (less than 2 points remaining)
   */
  removePoint(pointIri: string): boolean {
    this.connectedPoints.delete(pointIri);
    // A glue point with less than 2 points should be deleted
    return this.connectedPoints.size < 2;
  }

  /**
   * Check if this glue point connects a specific point
   * 
   * @param pointIri - Point IRI to check
   * @returns True if the point is connected by this glue point
   */
  hasPoint(pointIri: string): boolean {
    return this.connectedPoints.has(pointIri);
  }
  
  /**
   * Get the number of points connected by this glue point
   * 
   * @returns Number of connected points
   */
  get pointCount(): number {
    return this.connectedPoints.size;
  }

  /**
   * Create a GluePointModel from SPARQL binding
   * 
   * @param binding - Raw data from SPARQL query
   * @returns New glue point model
   */
  static fromSparqlBinding(binding: any): GluePointModel {
    return new GluePointModel(
      binding.gluePoint.value,
      [] // Points will be added separately
    );
  }
}