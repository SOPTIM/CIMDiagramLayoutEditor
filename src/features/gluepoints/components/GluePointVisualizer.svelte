<script lang="ts">
    import { onMount } from 'svelte';
    import type { ViewTransform } from '@/core/models/types';
    import { worldToScreen } from '@/utils/geometry';
    import { diagramData } from '../../diagram/DiagramState';
    import { showGluePoints, getGluePointsForVisualization, selectedGluePoint, highlightedGluePoints } from '../GluePointState';
    import { interactionState, togglePointSelection } from '../../interaction/InteractionState';
    import { serviceRegistry } from '@/services/ServiceRegistry';
    
    // Props
    export let viewTransform: ViewTransform;
    
    // Local state
    let gluePoints = [];
    let hoveredGluePoint = null;
    
    // Watch for changes in diagram data, viewTransform, or showGluePoints setting
    $: {
      if ($diagramData && $showGluePoints) {
        gluePoints = getGluePointsForVisualization();
      } else {
        gluePoints = [];
      }
    }
    
    // Handle glue point click
    function handleGluePointClick(event: MouseEvent, gluePointIri: string) {
      event.stopPropagation();
      
      // Toggle selection of this glue point
      if ($selectedGluePoint === gluePointIri) {
        // Deselect
        selectedGluePoint.set(null);
      } else {
        // Select and highlight connected points
        selectedGluePoint.set(gluePointIri);
        
        // Select all connected points
        serviceRegistry.gluePointService.selectConnectedPoints(gluePointIri);
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
        } else {
          // Select and highlight connected points
          selectedGluePoint.set(gluePointIri);
          
          // Select all connected points
          serviceRegistry.gluePointService.selectConnectedPoints(gluePointIri);
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
    
    // Handle key events
    function handleKeyDown(event: KeyboardEvent) {
      // Handle DELETE key to remove selected glue point
      if (event.key === 'Delete' && $selectedGluePoint) {
        event.preventDefault();
        serviceRegistry.gluePointService.removeGluePoint($selectedGluePoint);
        selectedGluePoint.set(null);
      }
    }
    
    onMount(() => {
      window.addEventListener('keydown', handleKeyDown);
      
      return () => {
        window.removeEventListener('keydown', handleKeyDown);
      };
    });
  </script>
  
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
        {#if $selectedGluePoint === gluePoint.iri || hoveredGluePoint === gluePoint.iri}
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
        {#if $selectedGluePoint === gluePoint.iri}
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
    
    .remove-icon {
      line-height: 1;
    }
  </style>