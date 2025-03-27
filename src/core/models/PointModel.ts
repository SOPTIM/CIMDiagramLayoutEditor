import type { Point2D, Bounds } from './types';
import type { DiagramObjectModel } from './DiagramObjectModel';
import { distanceSquared } from '@/utils/geometry';

/**
 * Model class for diagram points
 */
export class PointModel {
  iri: string;
  x: number;
  y: number;
  sequenceNumber: number;
  parentObject: DiagramObjectModel;

  /**
   * Create a new point
   * 
   * @param iri - Point IRI
   * @param x - X coordinate
   * @param y - Y coordinate
   * @param sequenceNumber - Point sequence number
   * @param parentObject - Parent diagram object
   */
  constructor(iri: string, x: number, y: number, sequenceNumber: number, parentObject: DiagramObjectModel) {
    this.iri = iri;
    this.x = parseFloat(String(x));
    this.y = parseFloat(String(y));
    this.sequenceNumber = parseInt(String(sequenceNumber)) || 0;
    this.parentObject = parentObject;
  }
  
  /**
   * Move the point by a delta
   * 
   * @param dx - X delta
   * @param dy - Y delta
   */
  move(dx: number, dy: number): void {
    this.x += dx;
    this.y += dy;
  }
  
  /**
   * Set the point position
   * 
   * @param x - New X coordinate
   * @param y - New Y coordinate
   */
  setPosition(x: number, y: number): void {
    this.x = parseFloat(String(x));
    this.y = parseFloat(String(y));
  }
  
  /**
   * Get the point position
   * 
   * @returns Point coordinates
   */
  getPosition(): Point2D {
    return { x: this.x, y: this.y };
  }
  
  /**
   * Check if point is within a rectangular area
   * 
   * @param bounds - Rectangle bounds
   * @returns True if point is within rectangle
   */
  isWithinBounds(bounds: Bounds): boolean {
    return (
      this.x >= bounds.minX && 
      this.x <= bounds.maxX && 
      this.y >= bounds.minY && 
      this.y <= bounds.maxY
    );
  }
  
  /**
   * Calculate distance from this point to another point or coordinates
   * 
   * @param point - Another point or coordinates
   * @returns Distance squared
   */
  distanceSquaredTo(point: Point2D): number {
    return distanceSquared(this.x, this.y, point.x, point.y);
  }
  
  /**
   * Check if the point is near the specified coordinates
   * 
   * @param point - Point to check against
   * @param radius - Radius to check within
   * @returns True if point is within radius
   */
  isNear(point: Point2D, radius: number): boolean {
    return this.distanceSquaredTo(point) <= radius * radius;
  }
  
  /**
   * Create a PointModel from raw data
   *
   * @param binding
   * @param parentObject - Parent diagram object
   * @returns New point model
   */
  static fromSparqlBinding(binding: any, parentObject: DiagramObjectModel): PointModel {
    return new PointModel(
      binding.point.value,
      binding.xPosition?.value ?? 0,
      binding.yPosition?.value ?? 0,
      binding.sequenceNumber?.value ?? 0,
      parentObject
    );
  }
}