import { get } from 'svelte/store';
import type { InteractionState, Point2D, MovePointsByDeltaData } from '@/core/models/types';
import { InteractionMode } from '@/core/models/types';
import type { PointModel } from '@/core/models/PointModel';
import { AppConfig } from '@/core/config/AppConfig';
import {pointToLineDistanceSquared, screenToWorld} from '@/utils/geometry';
import { findClosestLineSegment } from '@/utils/geometry';
import { serviceRegistry } from '@/services/ServiceRegistry';
import { canvasService } from '../../canvas/CanvasService';

// Import from UI state
import { updateCoordinates } from '../../ui/UIState';

// Import from canvas state
import { viewTransform, zoom as zoomViewport, resetViewTransform, gridSize } from '../../canvas/CanvasState';

// Import from interaction state
import { 
  interactionState,
  togglePointSelection,
  startSelecting,
  updateSelecting,
  completeSelecting,
  startDragging,
  updateDragging,
  endDragging,
  startPanning,
  updatePanning,
  endPanning,
  clearSelection,
  positionUpdateEvent
} from '../InteractionState';

// Import from diagram state
import { diagramData } from '../../diagram/DiagramState';

// Import from tooltip state
import {
  showTooltipForPoint,
  hideTooltipIfNotPinned,
  showPointTooltip,
  isTooltipPinned,
  isTooltipHovered,
  hideTooltip,
} from '../../tooltips/TooltipState';
import type { DiagramObjectModel } from '@/core/models/DiagramObjectModel';
import {selectedGluePoint, showGluePoints} from "@/features/gluepoints/GluePointState";
import type {DiagramModel} from "@/core/models/DiagramModel";

// Services
const pointService = serviceRegistry.pointService;
const objectService = serviceRegistry.objectService;

// Add a variable to track the last mouse event
let lastMouseEvent: MouseEvent | null = null;

// Add a variable to track temporary pan mode
let tempPanData = {
  previousMode: InteractionMode.NONE,
  enabled: false
};

/**
 * Svelte action for canvas interactions
 * Handles mouse and wheel events for panning, zooming, selecting, and dragging
 * 
 * @param canvas - Canvas element
 */
export function canvasInteraction(canvas: HTMLCanvasElement) {
  // Track mouse position for paste operations
  let currentMouseWorldPos: Point2D = { x: 0, y: 0 };
  
  // For tracking hover state
  let lastHoveredPoint: PointModel | null = null;
  let hoverCheckScheduled = false;
  
  // Handle keyboard events for copy/paste
  function handleKeyDown(e: KeyboardEvent) {
    if (get(showPointTooltip) && e.key === 'Escape') {
      // Close tooltip with Escape
      hideTooltip();
      return;
    }
    
    // If Escape is pressed and no tooltip is showing, clear selection
    if (e.key === 'Escape') {
      clearSelection();      
      selectedGluePoint.set(null); // Clear selected glue point if any
      return;
    }
    
    // Handle navigation with arrow keys
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      if (e.ctrlKey) {
        // Move selected objects with Ctrl + Arrow keys
        handleObjectMovement(e);
        return;
      } else {
        // Pan the canvas with Arrow keys
        handlePanning(e);
        return;
      }
    }
    
    // Handle zooming with Ctrl + plus/minus
    if (e.ctrlKey) {
      if (e.key === '=' || e.key === '+' || e.key === 'NumpadAdd') {
        e.preventDefault();
        handleZoom(true, e.shiftKey, e.altKey);
        return;
      } else if (e.key === '-' || e.key === '_' || e.key === 'NumpadSubtract') {
        e.preventDefault();
        handleZoom(false, e.shiftKey, e.altKey);
        return;
      } else if (e.key === '0' || e.key === 'Numpad0') {
        // Reset zoom to 100%
        e.preventDefault();
        resetViewTransform();
        canvasService.reRender();
        return;
      } else if (e.key === 'a') {
        // Select all objects
        e.preventDefault();
        selectAllObjects();
        return;
      } else if (e.key === 'f') {
        // Fit diagram to view
        e.preventDefault();
        fitDiagramToView();
        return;
      } else if (e.key === 'd') {
        // Duplicate selected objects
        e.preventDefault();
        duplicateSelectedObjects();
        return;
      } else if (e.key === 'c') {
        // Copy operation
        copySelectedDiagramObjects();
      } else if (e.key === 'v') {
        // Paste operation
        pasteDiagramObjects(currentMouseWorldPos);
      } else if (e.key === 'ArrowRight') {
        // Rotate 90 degrees clockwise
        e.preventDefault(); 
        rotateSelectedObjects(90);
      } else if (e.key === 'ArrowLeft') {
        // Rotate 90 degrees counter-clockwise
        e.preventDefault();
        rotateSelectedObjects(-90);
      }
    } else if (e.key === 'Delete') {
      // First check if a glue point is selected or if selected points are part of glue points
      const hasSelectedGluePoint = get(selectedGluePoint) !== null;
      if (hasSelectedGluePoint) {
        // Handle via GluePointVisualizer component (it has its own DELETE handler)
        return;
      }

      // Check if any selected points are part of glue points
      const selectedPoints = Array.from(get(interactionState).selectedPoints);
      if (selectedPoints.length > 0) {
        const diagram = get(diagramData);
        if (diagram) {
          // Check if any point is part of a glue connection
          const hasGluePoints = selectedPoints.some(pointIri =>
              diagram.pointToGluePointMap.has(pointIri)
          );

          if (hasGluePoints) {
            // Let the glue point service handle the delete operation
            serviceRegistry.gluePointService.handleDeleteKeyOnGluePoint();
            return;
          }
        }
      }

      // If no glue points are involved, proceed with regular delete operation
      deleteSelectedDiagramObjects();
    } else if (e.key === ' ') {
      // Space bar for temporary pan mode toggle
      e.preventDefault();
      togglePanMode(true);
    }
  }
  
  // Add double-click handler for inserting or deleting points
  function handleDoubleClick(e: MouseEvent) {
    // Don't act if the tooltip is active
    if (get(showPointTooltip)) {
      return;
    }
    
    const rect = canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    
    const currentTransform = get(viewTransform);
    const worldPos = screenToWorld(screenX, screenY, currentTransform);
    
    const diagram = get(diagramData);
    if (!diagram) return;
    
    // First check if we clicked on an existing point
    const selectionRadius = AppConfig.canvas.selectionThreshold * 
      Math.pow(currentTransform.scale, -0.3);
    
    const clickedPoint = diagram.findPointNear(worldPos, selectionRadius);
    
    if (clickedPoint) {
      // Attempt to delete the point
      deletePointFromLine(clickedPoint);
    } else {
      // Find closest line segment to add a new point
      const result = findClosestLineSegment(worldPos, diagram, AppConfig.canvas.selectionThreshold * 2);
      
      if (result) {
        addNewPointToLine(result.object, result.position, result.index);
      }
    }
  }

  // Handle key up events
  function handleKeyUp(e: KeyboardEvent): void {
    if (e.key === ' ') {
      // Space bar released, disable temporary pan mode
      togglePanMode(false);
    }
  }

  /**
   * Handle panning the canvas with arrow keys
   */
  function handlePanning(e: KeyboardEvent): void {
    const currentGridSize = get(gridSize);
    let panDistance: number;
    
    // Determine pan distance based on modifiers
    if (e.shiftKey) {
      panDistance = currentGridSize * 10; // Shift = 10x grid size
    } else if (e.altKey) {
      panDistance = 1; // Alt = precise 1-unit movement
    } else {
      panDistance = currentGridSize; // Default = grid size
    }
    
    // Apply pan in appropriate direction
    viewTransform.update(transform => {
      let offsetX = transform.offsetX;
      let offsetY = transform.offsetY;
      
      switch (e.key) {
        case 'ArrowUp':
          offsetY += panDistance * transform.scale;
          break;
        case 'ArrowDown':
          offsetY -= panDistance * transform.scale;
          break;
        case 'ArrowLeft':
          offsetX += panDistance * transform.scale;
          break;
        case 'ArrowRight':
          offsetX -= panDistance * transform.scale;
          break;
      }
      
      return { ...transform, offsetX, offsetY };
    });
    
    // Re-render the canvas
    canvasService.reRender();
  }

  /**
   * Handle moving selected objects with Ctrl + arrow keys
   */
  function handleObjectMovement(e: KeyboardEvent): void {
    const selectedPointIris = Array.from(get(interactionState).selectedPoints);
    if (selectedPointIris.length === 0) return;
    
    const currentGridSize = get(gridSize);
    let moveDistance: number;
    
    // Determine move distance based on modifiers
    if (e.shiftKey) {
      moveDistance = currentGridSize * 10; // Shift = 10x grid size
    } else if (e.altKey) {
      moveDistance = 1; // Alt = precise 1-unit movement
    } else {
      moveDistance = currentGridSize; // Default = grid size
    }
    
    // Calculate delta vector based on key pressed
    let dx = 0;
    let dy = 0;
    
    switch (e.key) {
      case 'ArrowUp':
        dy = -moveDistance;
        break;
      case 'ArrowDown':
        dy = moveDistance;
        break;
      case 'ArrowLeft':
        dx = -moveDistance;
        break;
      case 'ArrowRight':
        dx = moveDistance;
        break;
    }
    
    if (dx === 0 && dy === 0) return;
    
    // Move the points
    const moveData: MovePointsByDeltaData = {
      pointIris: selectedPointIris,
      deltaVector: { dx, dy }
    };
    
    // Move points locally first
    const diagram = get(diagramData);
    if (diagram) {
      diagram.points
        .filter(point => selectedPointIris.includes(point.iri))
        .forEach(point => {
          point.x += dx;
          point.y += dy;
        });
      
      // Update diagram to reflect changes
      diagramData.set(diagram);
    }
    
    // Trigger position update to persist changes
    positionUpdateEvent.set(moveData);
  }

  /**
   * Handle zooming with Ctrl + plus/minus keys
   */
  function handleZoom(zoomIn: boolean, largerStep: boolean = false, smallerStep: boolean = false): void {
    // Calculate zoom center (center of canvas)
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const center = {
      x: rect.width / 2,
      y: rect.height / 2
    };
    
    // Determine zoom factor based on modifiers
    let zoomFactor = AppConfig.canvas.zoomFactor;
    
    if (largerStep) {
      zoomFactor = Math.pow(zoomFactor, 2); // Larger step with Shift
    } else if (smallerStep) {
      zoomFactor = Math.sqrt(zoomFactor); // Smaller step with Alt
    }
    
    // Apply zoom
    viewTransform.update(transform => {
      // Determine new scale
      let newScale: number;
      if (zoomIn) {
        newScale = transform.scale * zoomFactor;
      } else {
        newScale = transform.scale / zoomFactor;
      }
      
      // Calculate new offsets to zoom at center
      const newOffsetX = center.x - (center.x - transform.offsetX) * (newScale / transform.scale);
      const newOffsetY = center.y - (center.y - transform.offsetY) * (newScale / transform.scale);
      
      return {
        scale: newScale,
        offsetX: newOffsetX,
        offsetY: newOffsetY
      };
    });
    
    // Re-render the canvas
    canvasService.reRender();
  }

  /**
   * Select all objects in the diagram
   */
  function selectAllObjects(): void {
    const diagram = get(diagramData);
    if (!diagram) return;
    
    const allPointIris = diagram.points.map(point => point.iri);
    
    interactionState.update(state => ({
      ...state,
      selectedPoints: new Set(allPointIris)
    }));
  }

  /**
   * Fit the diagram to the current view
   */
  function fitDiagramToView(): void {
    if (!canvas) return;
    
    const canvasSize = {
      width: canvas.width,
      height: canvas.height
    };
    
    serviceRegistry.diagramService.autoFitDiagram(canvasSize);
  }

  /**
   * Duplicate selected objects
   */
  function duplicateSelectedObjects(): void {
    // First copy the selected objects
    copySelectedDiagramObjects();
    
    // Then paste them with a slight offset
    const currentGridSize = get(gridSize);
    const offset = currentGridSize * 2; // Offset by 2x grid size
    
    // Find center of selection
    const selectedPointIris = Array.from(get(interactionState).selectedPoints);
    const diagram = get(diagramData);
    
    if (!diagram || selectedPointIris.length === 0) return;
    
    const selectedPoints = diagram.points.filter(point => selectedPointIris.includes(point.iri));
    let sumX = 0, sumY = 0;
    
    selectedPoints.forEach(point => {
      sumX += point.x;
      sumY += point.y;
    });
    
    const centerX = sumX / selectedPoints.length;
    const centerY = sumY / selectedPoints.length;
    
    // Paste at slightly offset position
    const pastePos = {
      x: centerX + offset,
      y: centerY
    };
    
    pasteDiagramObjects(pastePos);
  }

  /**
   * Toggle temporary pan mode
   */
  function togglePanMode(enabled: boolean): void {
    if (enabled) {
      const currentState = get(interactionState);
      if (currentState.mode !== InteractionMode.PANNING) {
        // Store previous mode
        tempPanData.previousMode = currentState.mode;
        tempPanData.enabled = true;
        
        // Start panning from current mouse position
        if (lastMouseEvent) {
          const rect = canvas.getBoundingClientRect();
          const mouseScreenPos = {
            x: lastMouseEvent.clientX - rect.left,
            y: lastMouseEvent.clientY - rect.top
          };
          
          startPanning(mouseScreenPos);
        }
      }
    } else {
      // Restore previous mode
      if (tempPanData.enabled) {
        endPanning();
        tempPanData.enabled = false;
        
        // If we were in a specific mode before, restore it
        if (tempPanData.previousMode !== InteractionMode.NONE) {
          // This would need more logic to fully restore previous state
          interactionState.update(state => ({
            ...state,
            mode: tempPanData.previousMode
          }));
          tempPanData.previousMode = InteractionMode.NONE;
        }
      }
    }
  }

  // Handle mouse movement for hover effects
  function handleMouseMove(e: MouseEvent) {
    // Store the last mouse event for pan mode
    lastMouseEvent = e;
    
    if (hoverCheckScheduled) return;
  
    const { screenPos, worldPos } = getCoordinatesFromEvent(e);
    currentMouseWorldPos = worldPos;
    updateCoordinates(worldPos);
    
    const currentState = get(interactionState);
    
    if (handleActiveInteractionIfNeeded(currentState, screenPos, worldPos, e)) {
      return;
    }
    
    // Only schedule hover check when not in active interaction
    hoverCheckScheduled = true;
    requestAnimationFrame(() => {
      checkForPointHover(worldPos);
      hoverCheckScheduled = false;
    });
  }

  function getCoordinatesFromEvent(e: MouseEvent) {
    const rect = canvas.getBoundingClientRect();
    const screenPos : Point2D = { 
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
    const worldPos = screenToWorld(screenPos.x, screenPos.y, get(viewTransform));
    return { screenPos, worldPos };
  }
  
  function handleActiveInteractionIfNeeded(
    state : InteractionState, 
    screenPos: Point2D, 
    worldPos: Point2D, 
    e: MouseEvent) {
    if (state.mode === InteractionMode.NONE) {
      return false;
    }
    
    if (state.mode === InteractionMode.PANNING && state.panStart) {
      updatePanning(screenPos);
    } else if (state.mode === InteractionMode.SELECTING) {
      updateSelecting(worldPos);
    } else if (state.mode === InteractionMode.DRAGGING) {
      updateDragging(worldPos, e.altKey);
    }
    
    return true;
  }
  
  // Check if the cursor is hovering over a point
  function checkForPointHover(worldPos: Point2D) {
    // Don't check if tooltip is pinned or being hovered
    if (get(isTooltipPinned) || get(isTooltipHovered)) return;
    
    // Don't show tooltips when in active interaction modes
    const currentState = get(interactionState);
    if (currentState.mode !== InteractionMode.NONE) return;
    
    const diagram = get(diagramData);
    if (!diagram) return;
    
    // Calculate hover radius based on zoom level
    const currentTransform = get(viewTransform);
    const hoverRadius = AppConfig.canvas.selectionThreshold * 
      Math.pow(currentTransform.scale, -0.3);
    
    // Find point under cursor
    const pointUnderCursor = diagram.findPointNear(worldPos, hoverRadius);
    
    // If we found a point and it's different from the last one, show its tooltip
    if (pointUnderCursor && pointUnderCursor !== lastHoveredPoint) {
      lastHoveredPoint = pointUnderCursor;
      showTooltipForPoint(pointUnderCursor);
    } 
    // If we didn't find a point but had one before, hide the tooltip
    else if (!pointUnderCursor && lastHoveredPoint) {
      lastHoveredPoint = null;
      hideTooltipIfNotPinned();
    }
  }

  // Handle mouse down for interactions
  function handleMouseDown(e: MouseEvent) {
    // Check if tooltip is pinned first
    if (get(isTooltipPinned)) {
      // If we click outside the tooltip area, close it
      if (!get(isTooltipHovered)) {
        hideTooltip();
      }
      return; // Skip other interactions when tooltip is pinned
    }
    
    // If tooltip is showing but not pinned, hide it
    if (get(showPointTooltip) && !get(isTooltipPinned)) {
      hideTooltip();
    }
    
    const rect = canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    
    const currentTransform = get(viewTransform);
    const worldPos = screenToWorld(screenX, screenY, currentTransform);
    
    const currentState = get(interactionState);
    const diagram = get(diagramData);
    
    if (!diagram) return;
    
    // Calculate selection radius based on zoom level
    const selectionRadius = AppConfig.canvas.selectionThreshold * 
      Math.pow(currentTransform.scale, -0.3);
    
    // Check if clicking on a point
    const clickedPoint = diagram.findPointNear(worldPos, selectionRadius);
      
    if (e.ctrlKey) {      
      if (clickedPoint) {
        // Toggle point selection
        togglePointSelection(clickedPoint.iri);
      } else {
        // Check if we clicked near a glue connection line
        const glueLineThreshold = selectionRadius * 2; // Make it a bit easier to click on lines
        const glueConnection = findClosestGlueConnection(worldPos, diagram, glueLineThreshold);

        if (glueConnection) {
          // Select both points connected by the glue line
          // If either point is already selected, we'll add the other one to the selection
          if (!currentState.selectedPoints.has(glueConnection.point1)) {
            togglePointSelection(glueConnection.point1);
          }
          if (!currentState.selectedPoints.has(glueConnection.point2)) {
            togglePointSelection(glueConnection.point2);
          }
        } else {
          // Start rectangular selection
          startSelecting(worldPos);
        }
      }
    } else if (currentState.selectedPoints.size > 0) {
      
      // Check if clicking on a selected point for dragging
      if (clickedPoint && currentState.selectedPoints.has(clickedPoint.iri)) {
        // Start dragging selected points, track ALT key state
        startDragging(worldPos, e.altKey);
      } else {
        // Not clicking on a selected point
        const anyPoint = diagram.findPointNear(worldPos, selectionRadius);
        
        if (!anyPoint) {
          // Clicked on empty space, clear selection
          clearSelection();
          if (get(selectedGluePoint) !== null) { // Clear selected glue point if any
            selectedGluePoint.set(null); 
          }
        }        
        // Start panning
        startPanning({ x: screenX, y: screenY });
      }
    } else {
      // No points selected

      // If a glue point is selected, deselect it when clicking elsewhere
      if (get(selectedGluePoint) !== null) {
        selectedGluePoint.set(null);
      }

      // // start panning
      startPanning({ x: screenX, y: screenY });
    }
  }

  // Handle mouse up events
  function handleMouseUp(e: MouseEvent) {
    const rect = canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    
    const currentTransform = get(viewTransform);
    const worldPos = screenToWorld(screenX, screenY, currentTransform);
    
    const currentState = get(interactionState);
    
    if (currentState.mode === InteractionMode.PANNING) {
      endPanning();
    } else if (currentState.mode === InteractionMode.SELECTING) {
      completeSelecting();
    } else if (currentState.mode === InteractionMode.DRAGGING) {
      endDragging(worldPos);
    }
    
    // After any interaction completes, check if we're hovering over a point
    requestAnimationFrame(() => {
      checkForPointHover(worldPos);
    });
  }

  // Handle mouse wheel events for zooming
  function handleWheel(e: WheelEvent) {
    e.preventDefault();
    
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    zoomViewport({ x: mouseX, y: mouseY }, e.deltaY);
    
    // When zooming, recheck point hover
    const worldPos = screenToWorld(mouseX, mouseY, get(viewTransform));
    requestAnimationFrame(() => {
      checkForPointHover(worldPos);
    });
  }
  
  // Handle mouse leave events
  function handleMouseLeave() {
    // Don't hide the tooltip if it's pinned or being hovered
    if (!get(isTooltipPinned) && !get(isTooltipHovered)) {
      hideTooltipIfNotPinned();
      lastHoveredPoint = null;
    }
  }

  // Feature functions that were previously in AppState.ts
  // Now delegate to appropriate services

  /**
   * Add a new point to a line in the diagram
   */
  async function addNewPointToLine( 
      object: DiagramObjectModel,
      position: Point2D,
      insertIndex: number) {
    await pointService.addNewPointToLine(object, position, insertIndex);
  }

  /**
   * Delete a point from a line in the diagram
   */
  async function deletePointFromLine(point: PointModel) {
    await pointService.deletePointFromLine(point);
  }

  /**
   * Copy selected diagram objects to clipboard
   */
  function copySelectedDiagramObjects() {
    // This would be implemented in ObjectService in the new architecture
    objectService.copySelectedDiagramObjects();
  }

  /**
   * Paste copied diagram objects at a specific position
   */
  function pasteDiagramObjects(position: Point2D) {
    objectService.pasteDiagramObjects(position);
  }

  /**
   * Delete selected diagram objects
   */
  function deleteSelectedDiagramObjects() {
    objectService.deleteSelectedDiagramObjects();
  }

  /**
   * Rotate selected objects around the center of selection
   */
  function rotateSelectedObjects(degrees: number) {
    objectService.rotateSelectedObjects(degrees);
  }

  function findClosestGlueConnection(worldPos: Point2D, diagram: DiagramModel, threshold: number): {point1: string, point2: string} | null {
    if (!diagram || !get(showGluePoints)) return null;

    let closestDistance = threshold;
    let closestConnection = null;

    // Get all glue connections
    diagram.gluePoints.forEach(gluePoint => {
      const connectedPoints = Array.from(gluePoint.connectedPoints);

      // For each pair of points in this glue point
      for (let i = 0; i < connectedPoints.length; i++) {
        for (let j = i + 1; j < connectedPoints.length; j++) {
          const point1 = diagram.points.find(p => p.iri === connectedPoints[i]);
          const point2 = diagram.points.find(p => p.iri === connectedPoints[j]);

          if (point1 && point2) {
            const distance = pointToLineDistanceSquared(
                worldPos,
                { x: point1.x, y: point1.y },
                { x: point2.x, y: point2.y }
            ).distanceSquared;

            if (distance < closestDistance) {
              closestDistance = distance;
              closestConnection = {
                point1: point1.iri,
                point2: point2.iri
              };
            }
          }
        }
      }
    });

    return closestConnection;
  }
  
  // Attach event listeners
  canvas.addEventListener('mousedown', handleMouseDown);
  canvas.addEventListener('mousemove', handleMouseMove);
  canvas.addEventListener('mouseup', handleMouseUp);
  canvas.addEventListener('wheel', handleWheel);
  canvas.addEventListener('dblclick', handleDoubleClick);
  canvas.addEventListener('mouseleave', handleMouseLeave);
  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('keyup', handleKeyUp);
  
  return {
    destroy() {
      // Remove event listeners on cleanup
      canvas.removeEventListener('mousedown', handleMouseDown);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mouseup', handleMouseUp);
      canvas.removeEventListener('wheel', handleWheel);
      canvas.removeEventListener('dblclick', handleDoubleClick);
      canvas.removeEventListener('mouseleave', handleMouseLeave);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      
      // Reset hover state
      lastHoveredPoint = null;
    }
  };
}