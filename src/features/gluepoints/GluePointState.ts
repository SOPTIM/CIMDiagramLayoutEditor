import { writable, derived, get } from 'svelte/store';
import { interactionState } from '../interaction/InteractionState';
import { diagramData } from '../diagram/DiagramState';

// UI state for glue points
export const showGluePoints = writable<boolean>(false);
export const selectedGluePoint = writable<string | null>(null);

// Helper to get all glue points to visualize
export function getGluePointsForVisualization(): Array<{
    iri: string;
    center: {x: number, y: number};
    connectedPoints: string[];
}> {
    const currentDiagram = get(diagramData);
    if (!currentDiagram || !get(showGluePoints)) return [];

    const gluePointsInfo: Array<{
        iri: string;
        center: {x: number, y: number};
        connectedPoints: string[];
    }> = [];

    // Process each glue point
    currentDiagram.gluePoints.forEach(gluePoint => {
        if (gluePoint.connectedPoints.size < 2) return;

        // Calculate center point
        let sumX = 0;
        let sumY = 0;
        let count = 0;
        const connectedPointIds: string[] = [];

        gluePoint.connectedPoints.forEach(pointIri => {
            const point = currentDiagram.points.find(p => p.iri === pointIri);
            if (point) {
                sumX += point.x;
                sumY += point.y;
                count++;
                connectedPointIds.push(pointIri);
            }
        });

        if (count < 2) return;

        gluePointsInfo.push({
            iri: gluePoint.iri,
            center: { x: sumX / count, y: sumY / count },
            connectedPoints: connectedPointIds
        });
    });

    return gluePointsInfo;
}

// Helper to check if a point is part of a glue point
export function isPointInGluePoint(pointIri: string): string | null {
    const currentDiagram = get(diagramData);
    if (!currentDiagram) return null;

    return currentDiagram.pointToGluePointMap.get(pointIri) || null;
}

// Derived store to track if connection checkbox should be shown
export const shouldShowGlueCheckbox  = derived(
    [interactionState, diagramData],
    ([$interactionState, $diagramData]) => {
        // Show if at least two points are selected
        if (!$diagramData || $interactionState.selectedPoints.size < 2) return false;

        // Check if selected points belong to different objects
        const pointIris = Array.from($interactionState.selectedPoints);
        const objectIris = new Set<string>();

        // Count distinct object IRIs
        for (const pointIri of pointIris) {
            const point = $diagramData.points.find(p => p.iri === pointIri);
            if (point && point.parentObject) {
                objectIris.add(point.parentObject.iri);
            }
        }

        // Only show if points are from at least two different objects
        return objectIris.size >= 2;
    }
);

// Derived store to track if the connection checkbox should be checked
export const isGlueChecked = derived(
    [interactionState, diagramData],
    ([$interactionState, $diagramData]) => {
        if (!$diagramData || $interactionState.selectedPoints.size < 2) return false;

        const pointIris = Array.from($interactionState.selectedPoints);

        // Check if all selected points share the same glue point
        let sharedGluePoint: string | null = null;
        let allConnected = true;

        for (const pointIri of pointIris) {
            const gluePointIri = $diagramData.pointToGluePointMap.get(pointIri);

            if (!gluePointIri) {
                allConnected = false;
                break;
            }

            if (sharedGluePoint === null) {
                sharedGluePoint = gluePointIri;
            } else if (sharedGluePoint !== gluePointIri) {
                allConnected = false;
                break;
            }
        }

        return allConnected && sharedGluePoint !== null;
    }
);

// Determine which points are highlighted as part of a selected glue point
export const highlightedGluePoints = derived(
    [selectedGluePoint, diagramData],
    ([$selectedGluePoint, $diagramData]) => {
        if (!$selectedGluePoint || !$diagramData) return new Set<string>();

        const gluePoint = $diagramData.gluePoints.find(gp => gp.iri === $selectedGluePoint);
        if (!gluePoint) return new Set<string>();

        return gluePoint.connectedPoints;
    }
);