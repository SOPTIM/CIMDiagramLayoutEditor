import type { 
  Point2D, 
  ViewTransform, 
  Bounds, 
  DrawingPointConfig 
} from '@/core/models/types';
import type { DiagramModel } from '@/core/models/DiagramModel';
import type { DiagramObjectModel } from '@/core/models/DiagramObjectModel';

/**
 * Calculate the squared distance between two points
 * 
 * @param x1 - First point X
 * @param y1 - First point Y
 * @param x2 - Second point X
 * @param y2 - Second point Y
 * @returns Distance between the points squared
 */
export function distanceSquared(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return dx * dx + dy * dy;
}

/**
 * Convert screen coordinates to world coordinates
 * 
 * @param screenX - Screen X coordinate
 * @param screenY - Screen Y coordinate
 * @param viewTransform - Current view transformation
 * @returns World coordinates
 */
export function screenToWorld(screenX: number, screenY: number, viewTransform: ViewTransform): Point2D {
  return {
    x: (screenX - viewTransform.offsetX) / viewTransform.scale,
    y: (screenY - viewTransform.offsetY) / viewTransform.scale
  };
}

/**
 * Convert world coordinates to screen coordinates
 * 
 * @param worldX - World X coordinate
 * @param worldY - World Y coordinate
 * @param viewTransform - Current view transformation
 * @returns Screen coordinates
 */
export function worldToScreen(worldX: number, worldY: number, viewTransform: ViewTransform): Point2D {
  return {
    x: worldX * viewTransform.scale + viewTransform.offsetX,
    y: worldY * viewTransform.scale + viewTransform.offsetY
  };
}

/**
 * Calculate dynamic size based on zoom level
 * 
 * @param sizeConfig - Size configuration 
 * @param scale - Current zoom scale
 * @returns Adjusted size
 */
export function getDynamicSize(sizeConfig: DrawingPointConfig, scale: number): number {
  return Math.max(
    sizeConfig.min, 
    Math.min(
      sizeConfig.max, 
      sizeConfig.base * Math.pow(scale, -0.3)
    )
  );
}

/**
 * Add padding to diagram bounds
 * 
 * @param bounds - Original bounds
 * @param padding - Padding factor (0.05 = 5%)
 * @returns Bounds with padding
 */
export function addPaddingToBounds(bounds: Bounds, padding: number): Bounds {
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  
  return {
    minX: bounds.minX - width * padding,
    minY: bounds.minY - height * padding,
    maxX: bounds.maxX + width * padding,
    maxY: bounds.maxY + height * padding
  };
}

/**
 * Calculate scale to fit bounds in canvas
 * 
 * @param bounds - Bounds to fit
 * @param canvasWidth - Canvas width
 * @param canvasHeight - Canvas height
 * @param maxScale - Maximum scale (default 1.0)
 * @returns Scale factor
 */
export function calculateFitScale(
  bounds: Bounds, 
  canvasWidth: number, 
  canvasHeight: number, 
  maxScale: number = 1.0
): number {
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  
  if (width === 0 || height === 0) {
    return maxScale;
  }
  
  const scaleX = canvasWidth / width;
  const scaleY = canvasHeight / height;
  
  return Math.min(scaleX, scaleY, maxScale);
}

/**
 * Calculate the squared distance from a point to a line segment
 * 
 * @param point - Point coordinates
 * @param lineStart - Line segment start coordinates
 * @param lineEnd - Line segment end coordinates
 * @returns Distance squared and projected point on the line
 */
export function pointToLineDistanceSquared(
  point: Point2D,
  lineStart: Point2D,
  lineEnd: Point2D
): { distanceSquared: number; projectedPoint: Point2D } {
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;
  
  // Line segment is a point
  if (dx === 0 && dy === 0) {
    return {
      distanceSquared: distanceSquared(point.x, point.y, lineStart.x, lineStart.y),
      projectedPoint: { x: lineStart.x, y: lineStart.y }
    };
  }
  
  // Calculate projection of point onto line
  const lengthSquared = dx * dx + dy * dy;
  const t = Math.max(0, Math.min(1, ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / lengthSquared));
  
  const projectedPoint = {
    x: lineStart.x + t * dx,
    y: lineStart.y + t * dy
  };
  
  return {
    distanceSquared: distanceSquared(point.x, point.y, projectedPoint.x, projectedPoint.y),
    projectedPoint
  };
}

/**
 * Find the closest line segment to a point in the diagram
 * 
 * @param point - Point coordinates to check against
 * @param diagram - Diagram model
 * @param maxDistance - Maximum distance to consider
 * @returns Object with line segment information or null if none found
 */
export function findClosestLineSegment(
  point: Point2D,
  diagram: DiagramModel,
  maxDistance: number
): { 
  object: DiagramObjectModel; 
  index: number;
  position: Point2D;
  distance: number; 
} | null {
  const maxDistanceSquared = maxDistance * maxDistance;
  let closestResult = null;
  let closestDistSquared = maxDistanceSquared;
  
  // Process each object in the diagram
  for (const object of diagram.objects) {
    if (object.points.length < 2) continue;
    
    // Find closest segment from regular segments
    const regularSegmentResult = findClosestRegularSegment(
      point, object, closestDistSquared
    );
    
    if (regularSegmentResult) {
      closestDistSquared = regularSegmentResult.distanceSquared;
      closestResult = regularSegmentResult.result;
    }
    
    // Check closing segment if polygon
    if (object.isPolygon && object.points.length > 2) {
      const polygonClosingResult = findClosestPolygonClosingSegment(
        point, object, closestDistSquared
      );
      
      if (polygonClosingResult) {
        closestResult = polygonClosingResult.result;
      }
    }
  }
  
  return closestResult;
}

function findClosestRegularSegment(
  point: Point2D, 
  object : DiagramObjectModel, 
  maxDistSquared: number) {
  let closestDist = maxDistSquared;
  let result = null;
  
  // Check each segment in the object
  for (let i = 0; i < object.points.length - 1; i++) {
    const segmentStart = { x: object.points[i].x, y: object.points[i].y };
    const segmentEnd = { x: object.points[i+1].x, y: object.points[i+1].y };
    
    const { distanceSquared, projectedPoint } = pointToLineDistanceSquared(
      point, segmentStart, segmentEnd
    );
    
    if (distanceSquared < closestDist) {
      closestDist = distanceSquared;
      result = {
        object,
        index: i + 1, // Insert position (after segmentStart)
        position: projectedPoint,
        distance: Math.sqrt(distanceSquared)
      };
    }
  }
  
  return result ? { distanceSquared: closestDist, result } : null;
}

function findClosestPolygonClosingSegment(
  point: Point2D, 
  object : DiagramObjectModel, 
  maxDistSquared: number) {
  const lastPoint = object.points[object.points.length - 1];
  const firstPoint = object.points[0];
  
  const segmentStart = { x: lastPoint.x, y: lastPoint.y };
  const segmentEnd = { x: firstPoint.x, y: firstPoint.y };
  
  const { distanceSquared, projectedPoint } = pointToLineDistanceSquared(
    point, segmentStart, segmentEnd
  );
  
  if (distanceSquared < maxDistSquared) {
    return {
      distanceSquared,
      result: {
        object,
        index: 0, // Insert at beginning for polygon closing segment
        position: projectedPoint,
        distance: Math.sqrt(distanceSquared)
      }
    };
  }
  
  return null;
}