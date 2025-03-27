
import { PointModel } from './PointModel';
import type { Point2D } from './types';

/**
 * Model class for diagram objects
 */
export class DiagramObjectModel {
    iri: string;
    drawingOrder: number;
    isPolygon: boolean;
    isText: boolean;
    textContent: string;
    points: PointModel[];
  
    /**
     * Create a new diagram object
     * 
     * @param iri - Object IRI
     * @param drawingOrder - Drawing order
     * @param isPolygon - Whether object is a polygon
     * @param isText - Whether object is a text
     * @param textContent - Text content
     */
    constructor(
      iri: string, 
      drawingOrder: number,
      isPolygon: boolean,
      isText: boolean,
      textContent: string
    ) {
      this.iri = iri;
      this.drawingOrder = parseInt(String(drawingOrder)) || 0;
      this.isPolygon = isPolygon;
      this.isText = isText;
      this.textContent = textContent || '';
      this.points = [];
    }
    
    /**
     * Add a point to this object
     * 
     * @param point - Point to add
     */
    addPoint(point: PointModel): void {
      this.points.push(point);
      // Ensure points are sorted by sequence number
      this.points.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
    }
    
    /**
     * Check if this is a single point object
     * 
     * @returns True if this is a single point
     */
    isSinglePoint(): boolean {
      return this.points.length === 1;
    }
    
    /**
     * Check if this object contains a specific point
     * 
     * @param pointIri - Point IRI to check
     * @returns True if object contains the point
     */
    containsPoint(pointIri: string): boolean {
      return this.points.some(point => point.iri === pointIri);
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
      
      for (const point of this.points) {
        if (point.distanceSquaredTo(position) <= radiusSquared) {
          return point;
        }
      }
      
      return null;
    }
    
    /**
     * Create a DiagramObjectModel from raw data
     * 
     * @param binding - Raw object data
     * @returns New diagram object model
     */
    static fromSparqlBinding(binding: any): DiagramObjectModel {
      return new DiagramObjectModel(
        binding.diagramObject.value,
        binding.drawingOrder?.value ?? 0,
        binding.isPolygon?.value === 'true',
        binding.isTextDiagramObject?.value === 'true',
        binding.textContent?.value ?? ''
      );
    }
  }