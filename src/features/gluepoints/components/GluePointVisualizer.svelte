<script lang="ts">
  import { onMount } from 'svelte';
  import type { ViewTransform, Point2D } from '@/core/models/types';
  import { worldToScreen } from '@/utils/geometry';
  import { diagramData } from '../../diagram/DiagramState';
  import { showGluePoints, getGluePointsForVisualization, selectedGluePoint } from '../GluePointState';
  import { serviceRegistry } from '@/services/ServiceRegistry';
  
  // Props
  export let viewTransform: ViewTransform;
  
  // Define types
  interface GluePointInfo {
    iri: string;
    center: Point2D;
    connectedPoints: string[];
  }
  
  interface CandidatePoint {
    pointIri: string;
    screenPos: Point2D;
  }
  
  // Local state
  let gluePoints: GluePointInfo[] = [];
  let hoveredGluePoint: string | null = null;
  let mousePosition: Point2D = { x: 0, y: 0 };
  let canvas: HTMLCanvasElement | null = null;
  
  // State for candidate points to add
  let candidatePoints: CandidatePoint[] = [];
  
  // Define the radius for showing add buttons (in screen pixels)
  const ADD_BUTTON_RADIUS = 50;
  
  // Watch for changes in diagram data, viewTransform, or showGluePoints setting
  $: {
    if ($diagramData && $showGluePoints) {
      gluePoints = getGluePointsForVisualization();
    } else {
      gluePoints = [];
    }
  }
  
  // Update mouse position on mousemove
  let mouseMoveTimer: number | null = null;
  function handleMouseMove(event: MouseEvent) {
    // Update mouse position immediately
    if (!canvas) {
      canvas = document.getElementById('diagram-canvas') as HTMLCanvasElement;
    }
    
    if (canvas) {
      const rect = canvas.getBoundingClientRect();
      mousePosition = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
      };
      
      // Debounce the expensive candidate point calculation
      if (mouseMoveTimer) {
        clearTimeout(mouseMoveTimer);
      }
      
      if ($selectedGluePoint && $diagramData) {
        mouseMoveTimer = window.setTimeout(() => {
          calculateCandidatePoints();
          mouseMoveTimer = null;
        }, 50); // 50ms debounce
      }
    }
  }
  
  // Calculate candidate points that could be added to the selected glue point
  function calculateCandidatePoints() {
    if (!$selectedGluePoint || !$diagramData) {
      candidatePoints = [];
      return;
    }
    
    // Find the selected glue point
    const selectedGluePointObj = gluePoints.find(gp => gp.iri === $selectedGluePoint);
    if (!selectedGluePointObj) {
      candidatePoints = [];
      return;
    }
    
    // Get all object IRIs already in this glue point
    const objectsInGluePoint = new Set<string>();
    const pointsInGluePoint = new Set<string>(selectedGluePointObj.connectedPoints);
    
    selectedGluePointObj.connectedPoints.forEach(pointIri => {
      const point = $diagramData.points.find(p => p.iri === pointIri);
      if (point && point.parentObject) {
        objectsInGluePoint.add(point.parentObject.iri);
      }
    });
    
    // Find potential points to add (that are nearby and from different objects)
    const candidates: CandidatePoint[] = [];
    
    for (const point of $diagramData.points) {
      // Skip points already in the glue point
      if (pointsInGluePoint.has(point.iri)) continue;
      
      // Skip points from objects already in the glue point
      if (objectsInGluePoint.has(point.parentObject.iri)) continue;
      
      // Skip points already in other glue points
      if ($diagramData.pointToGluePointMap.has(point.iri)) continue;
      
      // Check if point is near cursor
      const pointScreenPos = worldToScreen(point.x, point.y, viewTransform);
      const dx = pointScreenPos.x - mousePosition.x;
      const dy = pointScreenPos.y - mousePosition.y;
      const distSquared = dx * dx + dy * dy;
      
      if (distSquared <= ADD_BUTTON_RADIUS * ADD_BUTTON_RADIUS) {
        candidates.push({
          pointIri: point.iri,
          screenPos: pointScreenPos
        });
      }
    }
    
    candidatePoints = candidates;
  }
  
  // Handle glue point click
  function handleGluePointClick(event: MouseEvent, gluePointIri: string) {
    event.stopPropagation();
    
    // Toggle selection of this glue point
    if ($selectedGluePoint === gluePointIri) {
      // Deselect
      selectedGluePoint.set(null);
      candidatePoints = [];
    } else {
      // Select and highlight connected points
      selectedGluePoint.set(gluePointIri);
      
      // Select all connected points
      serviceRegistry.gluePointService.selectConnectedPoints(gluePointIri);
      
      // Schedule a candidate point calculation
      setTimeout(calculateCandidatePoints, 50);
    }
  }
  
  // Handle glue point keyboard event
  function handleGluePointKeyDown(event: KeyboardEvent, gluePointIri: string) {
    // Handle Enter or Space for selection
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      
      // Toggle selection of this glue point
      if ($selectedGluePoint === gluePointIri) {
        // Deselect
        selectedGluePoint.set(null);
        candidatePoints = [];
      } else {
        // Select and highlight connected points
        selectedGluePoint.set(gluePointIri);
        
        // Select all connected points
        serviceRegistry.gluePointService.selectConnectedPoints(gluePointIri);
        
        // Schedule a candidate point calculation
        setTimeout(calculateCandidatePoints, 50);
      }
    }
  }
  
  // Handle hover events
  function handleGluePointMouseEnter(gluePointIri: string) {
    hoveredGluePoint = gluePointIri;
  }
  
  function handleGluePointMouseLeave() {
    hoveredGluePoint = null;
  }
  
  // Handle point removal from glue point
  function handleRemovePoint(event: MouseEvent, pointIri: string, gluePointIri: string) {
    event.stopPropagation();
    serviceRegistry.gluePointService.removePointFromGluePoint(pointIri, gluePointIri);
  }
  
  // Handle keyboard removal from glue point
  function handleRemovePointKeyDown(event: KeyboardEvent, pointIri: string, gluePointIri: string) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      serviceRegistry.gluePointService.removePointFromGluePoint(pointIri, gluePointIri);
    }
  }
  
  // Handle adding a point to a glue point
  function handleAddPoint(event: MouseEvent, pointIri: string, gluePointIri: string) {
    event.stopPropagation();
    serviceRegistry.gluePointService.addPointToGluePoint(pointIri, gluePointIri);
  }
  
  // Handle adding a point using keyboard
  function handleAddPointKeyDown(event: KeyboardEvent, pointIri: string, gluePointIri: string) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      serviceRegistry.gluePointService.addPointToGluePoint(pointIri, gluePointIri);
    }
  }
  
  // Handle key events
  function handleKeyDown(event: KeyboardEvent) {
    // Handle DELETE key to remove selected glue point
    if (event.key === 'Delete' && $selectedGluePoint) {
      event.preventDefault();
      serviceRegistry.gluePointService.removeGluePoint($selectedGluePoint);
      selectedGluePoint.set(null);
      candidatePoints = [];
    }
  }
  
  // Handle zoom changes
  function handleZoomChange() {
    if ($selectedGluePoint) {
      // Recalculate candidate points after zooming
      calculateCandidatePoints();
    }
  }
  
  // Register global event listeners
  onMount(() => {
    canvas = document.getElementById('diagram-canvas') as HTMLCanvasElement;
    
    if (canvas) {
      canvas.addEventListener('mousemove', handleMouseMove);
      canvas.addEventListener('wheel', handleZoomChange);
    }
    
    window.addEventListener('keydown', handleKeyDown);
    
    return () => {
      if (canvas) {
        canvas.removeEventListener('mousemove', handleMouseMove);
        canvas.removeEventListener('wheel', handleZoomChange);
      }
      
      if (mouseMoveTimer) {
        clearTimeout(mouseMoveTimer);
      }
      
      window.removeEventListener('keydown', handleKeyDown);
    };
  });
</script>

<svelte:window on:mousemove={handleMouseMove}/>

{#if $showGluePoints}
  <div class="glue-points-container">
    {#each gluePoints as gluePoint}
      <!-- Render each glue point as a marker -->
      {@const screenPos = worldToScreen(gluePoint.center.x, gluePoint.center.y, viewTransform)}
      
      <button 
        type="button"
        class="glue-point-marker"
        class:selected={$selectedGluePoint === gluePoint.iri}
        class:hovered={hoveredGluePoint === gluePoint.iri}
        style="left: {screenPos.x}px; top: {screenPos.y}px;"
        on:click={(e) => handleGluePointClick(e, gluePoint.iri)}
        on:keydown={(e) => handleGluePointKeyDown(e, gluePoint.iri)}
        on:mouseenter={() => handleGluePointMouseEnter(gluePoint.iri)}
        on:mouseleave={handleGluePointMouseLeave}
        aria-label={`Glue point connecting ${gluePoint.connectedPoints.length} points`}
        aria-pressed={$selectedGluePoint === gluePoint.iri}
      ></button>
      
      <!-- Render lines to connected points when selected or hovered -->
      {#if ($selectedGluePoint === gluePoint.iri || hoveredGluePoint === gluePoint.iri) && $diagramData}
        <svg class="glue-connections" style="position: absolute; left: 0; top: 0; width: 100%; height: 100%; pointer-events: none;">
          {#each gluePoint.connectedPoints as pointIri}
            {@const point = $diagramData.points.find(p => p.iri === pointIri)}
            {#if point}
              {@const pointScreenPos = worldToScreen(point.x, point.y, viewTransform)}
              <line 
                x1={screenPos.x} 
                y1={screenPos.y} 
                x2={pointScreenPos.x} 
                y2={pointScreenPos.y}
                class="glue-connection-line" 
              />
            {/if}
          {/each}
        </svg>
      {/if}
      
      <!-- Render individual "remove from glue" buttons when selected -->
      {#if $selectedGluePoint === gluePoint.iri && $diagramData}
        {#each gluePoint.connectedPoints as pointIri}
          {@const point = $diagramData.points.find(p => p.iri === pointIri)}
          {#if point}
            {@const pointScreenPos = worldToScreen(point.x, point.y, viewTransform)}
            <button 
              type="button"
              class="remove-glue-button"
              style="left: {pointScreenPos.x + 15}px; top: {pointScreenPos.y - 15}px;"
              on:click={(e) => handleRemovePoint(e, pointIri, gluePoint.iri)}
              on:keydown={(e) => handleRemovePointKeyDown(e, pointIri, gluePoint.iri)}
              aria-label={`Remove point from glue connection`}
            >
              <span class="remove-icon" aria-hidden="true">×</span>
            </button>
          {/if}
        {/each}
      {/if}
    {/each}
    
    <!-- Render add buttons for candidate points -->
    {#if candidatePoints.length > 0 && $selectedGluePoint}
      {#each candidatePoints as candidate}
        <button 
          type="button"
          class="add-to-glue-button"
          style="left: {candidate.screenPos.x + 15}px; top: {candidate.screenPos.y - 15}px;"
          on:click={(e) => handleAddPoint(e, candidate.pointIri, $selectedGluePoint)}
          on:keydown={(e) => handleAddPointKeyDown(e, candidate.pointIri, $selectedGluePoint)}
          aria-label="Add point to glue connection"
        >
          <span class="add-icon" aria-hidden="true">+</span>
        </button>
      {/each}
    {/if}
  </div>
{/if}

<style>
  .glue-points-container {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 5;
  }
  
  .glue-point-marker {
    position: absolute;
    width: 12px;
    height: 12px;
    background-color: lime;
    border: 1px solid darkgreen;
    border-radius: 50%;
    transform: translate(-50%, -50%);
    cursor: pointer;
    pointer-events: auto;
    z-index: 6;
    transition: transform 0.1s ease;
    padding: 0;
  }
  
  .glue-point-marker.selected {
    transform: translate(-50%, -50%) scale(1.5);
    box-shadow: 0 0 0 2px white, 0 0 0 3px darkgreen;
  }
  
  .glue-point-marker.hovered {
    transform: translate(-50%, -50%) scale(1.3);
  }
  
  .glue-connection-line {
    stroke: lime;
    stroke-width: 1;
    stroke-dasharray: 4, 4;
    stroke-opacity: 0.8;
  }
  
  .remove-glue-button {
    position: absolute;
    width: 16px;
    height: 16px;
    background-color: red;
    border-radius: 50%;
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: bold;
    font-size: 12px;
    cursor: pointer;
    pointer-events: auto;
    transform: translate(-50%, -50%);
    z-index: 7;
    padding: 0;
    border: none;
  }
  
  .add-to-glue-button {
    position: absolute;
    width: 16px;
    height: 16px;
    background-color: green;
    border-radius: 50%;
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: bold;
    font-size: 12px;
    cursor: pointer;
    pointer-events: auto;
    transform: translate(-50%, -50%);
    z-index: 7;
    padding: 0;
    border: none;
  }
  
  .remove-icon, .add-icon {
    line-height: 1;
  }
</style>