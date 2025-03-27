import { DiagramObjectModel } from './DiagramObjectModel';
import { GluePointModel } from './GluePointModel';
import { PointModel } from './PointModel';
import type { Bounds, Point2D, SparqlResults } from './types';
import { v4 as uuidv4 } from 'uuid';



/**
 * Model for the complete diagram data
 */
export class DiagramModel {
  objects: DiagramObjectModel[];
  points: PointModel[];
  texts: DiagramObjectModel[];
  gluePoints: GluePointModel[];
  pointToGluePointMap: Map<string, string>; // Maps point IRI to glue point IRI

  /**
   * Create a new diagram model
   */
  constructor() {
    this.objects = [];
    this.points = [];
    this.texts = [];
    this.gluePoints = [];
    this.pointToGluePointMap = new Map<string, string>();
  }
  
  /**
   * Add a diagram object
   * 
   * @param object - Object to add
   */
  addObject(object: DiagramObjectModel): void {
    this.objects.push(object);
    
    // Add to texts array if it's a text object
    if (object.isText && object.textContent) {
      this.texts.push(object);
    }
  }
  
  /**
   * Add a point
   * 
   * @param point - Point to add
   */
  addPoint(point: PointModel): void {
    this.points.push(point);
  }

  

  /**
   * Add a glue point
   * 
   * @param gluePoint - Glue point to add
   */
  addGluePoint(gluePoint: GluePointModel): void {
    this.gluePoints.push(gluePoint);
    
    // Update the mapping for each connected point
    gluePoint.connectedPoints.forEach(pointIri => {
      this.pointToGluePointMap.set(pointIri, gluePoint.iri);
    });
  }

  /**
   * Get the glue point for a specific point
   * 
   * @param pointIri - Point IRI to check
   * @returns The glue point if found, or null
   */
  getGluePointForPoint(pointIri: string): GluePointModel | null {
    const gluePointIri = this.pointToGluePointMap.get(pointIri);
    if (!gluePointIri) return null;
    
    return this.gluePoints.find(gp => gp.iri === gluePointIri) || null;
  }

  /**
   * Get all points connected to a point via a glue point
   * 
   * @param pointIri - Point IRI to check
   * @returns Array of connected point IRIs
   */
  getGluedPoints(pointIri: string): string[] {
    const gluePoint = this.getGluePointForPoint(pointIri);
    if (!gluePoint) return [];
    
    // Return all points except the query point
    return Array.from(gluePoint.connectedPoints).filter(iri => iri !== pointIri);
  }

  /**
   * Create a glue point between two or more points
   * 
   * @param pointIris - Array of point IRIs to glue together
   * @param gluePointIri - Optional IRI for the new glue point
   * @returns The created glue point
   */
  createGluePoint(pointIris: string[], gluePointIri?: string): GluePointModel {
    // Create a new glue point
    const newGluePoint = new GluePointModel(
      gluePointIri || `urn:uuid:${uuidv4()}`,
      pointIris
    );
    
    // Add it to the diagram
    this.addGluePoint(newGluePoint);
    
    return newGluePoint;
  }

  /**
   * Remove a glue point
   * 
   * @param gluePointIri - Glue point IRI to remove
   */
  removeGluePoint(gluePointIri: string): void {
    const gluePoint = this.gluePoints.find(gp => gp.iri === gluePointIri);
    if (!gluePoint) return;
    
    // Remove mappings for all connected points
    gluePoint.connectedPoints.forEach(pointIri => {
      this.pointToGluePointMap.delete(pointIri);
    });
    
    // Remove the glue point
    this.gluePoints = this.gluePoints.filter(gp => gp.iri !== gluePointIri);
  }
  
  /**
   * Sort objects by drawing order
   */
  sortObjects(): void {
    this.objects.sort((a, b) => a.drawingOrder - b.drawingOrder);
  }
  
  /**
   * Get all diagram bounds
   * 
   * @returns Bounds with minX, minY, maxX, maxY
   */
  getBounds(): Bounds {
    if (this.points.length === 0) {
      return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    }
    
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    
    for (const point of this.points) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }
    
    return { minX, minY, maxX, maxY };
  }
  
  /**
   * Find a point near given coordinates
   * 
   * @param position - Position to check
   * @param radius - Search radius
   * @returns Found point or null
   */
  findPointNear(position: Point2D, radius: number): PointModel | null {
    const radiusSquared = radius * radius;
    let closestPoint: PointModel | null = null;
    let closestDistSq = radiusSquared;
    
    for (const point of this.points) {
      const distSq = point.distanceSquaredTo(position);
      if (distSq < closestDistSq) {
        closestDistSq = distSq;
        closestPoint = point;
      }
    }
    
    return closestPoint;
  }
  
  /**
   * Process diagram data from SPARQL response
   * 
   * @param data - SPARQL response data
   * @returns Processed diagram model
   */
  static fromSparqlResults(results: SparqlResults): DiagramModel {
    const diagram = new DiagramModel();
    const objectMap = new Map<string, DiagramObjectModel>();
    
    // First pass: create objects
    results.results.bindings.forEach(binding => {
      const objectIri = binding.diagramObject.value;
      
      if (!objectMap.has(objectIri)) {
        const object = DiagramObjectModel.fromSparqlBinding(binding);
        
        objectMap.set(objectIri, object);
        diagram.addObject(object);
      }
    });
    
    // Second pass: add points to objects
    results.results.bindings.forEach(binding => {
      const objectIri = binding.diagramObject.value;
      const object = objectMap.get(objectIri);
      
      if (object) {
        const point = PointModel.fromSparqlBinding(binding, object);
        
        object.addPoint(point);
        diagram.addPoint(point);
      }
    });
    
    // Sort objects by drawing order
    diagram.sortObjects();
    
    // Process glue points from SPARQL results
    const gluePointMap = new Map<string, GluePointModel>();

    // First pass: create glue point objects
    results.results.bindings.forEach(binding => {
      if (binding.gluePoint && binding.point) {
        const gluePointIri = binding.gluePoint.value;
        const pointIri = binding.point.value;
        
        // Create glue point if it doesn't exist
        if (!gluePointMap.has(gluePointIri)) {
          gluePointMap.set(gluePointIri, new GluePointModel(gluePointIri));
        }
        
        // Add the point to the glue point
        const gluePoint = gluePointMap.get(gluePointIri);
        if (gluePoint) {
          gluePoint.addPoint(pointIri);
        }
      }
    });

    // Add all glue points to the diagram
    gluePointMap.forEach(gluePoint => {
      diagram.addGluePoint(gluePoint);
    });

    return diagram;
  }
}