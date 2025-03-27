import { writable, derived, get } from 'svelte/store';
import { interactionState } from '../interaction/InteractionState';
import { diagramData } from '../diagram/DiagramState';

// UI state for glue points
export const showGluePoints = writable<boolean>(false);

// Helper to get all points that should be visualized with glue connections
export function getVisibleGlueConnections(): Array<{ 
  point1: string;
  point2: string;
  gluePointIri: string;
}> {
  const currentDiagram = get(diagramData);
  if (!currentDiagram || !get(showGluePoints)) return [];
  
  const connections: Array<{
    point1: string;
    point2: string;
    gluePointIri: string;
  }> = [];
  
  // Process each glue point
  currentDiagram.gluePoints.forEach(gluePoint => {
    const pointIris = Array.from(gluePoint.connectedPoints);
    
    // For each pair of points in this glue point, create a connection
    for (let i = 0; i < pointIris.length; i++) {
      for (let j = i + 1; j < pointIris.length; j++) {
        connections.push({
          point1: pointIris[i],
          point2: pointIris[j],
          gluePointIri: gluePoint.iri
        });
      }
    }
  });
  
  return connections;
}

// Helper to check if two points are connected by a glue point
export function arePointsGlued(point1Iri: string, point2Iri: string): boolean {
  const currentDiagram = get(diagramData);
  if (!currentDiagram) return false;
  
  const gluePoint1 = currentDiagram.getGluePointForPoint(point1Iri);
  const gluePoint2 = currentDiagram.getGluePointForPoint(point2Iri);
  
  return !!(gluePoint1 && gluePoint2 && gluePoint1.iri === gluePoint2.iri);
}

// Derived store to track if connection checkbox should be shown
export const shouldShowGlueCheckbox  = derived(
  [interactionState, diagramData],
  ([$interactionState, $diagramData]) => {
    // Show if exactly two points are selected and they belong to different objects
    if (!$diagramData || $interactionState.selectedPoints.size !== 2) return false;
    
    const pointIris = Array.from($interactionState.selectedPoints);
    const point1 = $diagramData.points.find(p => p.iri === pointIris[0]);
    const point2 = $diagramData.points.find(p => p.iri === pointIris[1]);
    
    if (!point1 || !point2) return false;
    
    // Check if points belong to different objects
    return point1.parentObject.iri !== point2.parentObject.iri;
  }
);

// Derived store to track if the connection checkbox should be checked
export const isGlueChecked  = derived(
  [interactionState, diagramData],
  ([$interactionState, $diagramData]) => {
    if (!$diagramData || $interactionState.selectedPoints.size !== 2) return false;
    
    const pointIris = Array.from($interactionState.selectedPoints);
    return arePointsGlued(pointIris[0], pointIris[1]);
  }
);