
import { PointModel } from './PointModel';
import type { Bounds, Point2D } from './types';

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
      this.isPolygon = isPolygon === true;
      this.isText = isText === true;
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
     * Get the bounds of this object
     * 
     * @returns Bounds object
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