<script lang="ts">
    import type { Point2D, ViewTransform } from '@/core/models/types';
    import { worldToScreen } from '@/utils/geometry';
    import { interactionState } from '../../interaction/InteractionState';
    import { shouldShowConnectionCheckbox, isConnectionChecked } from '../GluePointState';
    import { diagramData } from '../../diagram/DiagramState';
    import { serviceRegistry } from '@/services/ServiceRegistry';
    
    // Props
    const { viewTransform } = $props<{ viewTransform: ViewTransform }>();
    
    // Local state
    let position = $state<Point2D>({ x: 0, y: 0 });
    let checkboxId = `connection-${Math.random().toString(36).substring(2, 9)}`;
    let isVisible = $state(false);
    let isChecked = $state(false);
    
    // Watch changes in selected points
    $effect(() => {
      // Update visibility
      isVisible = $shouldShowConnectionCheckbox;
      
      // Update checked state
      isChecked = $isConnectionChecked;
      
      // Update position (calculated midpoint between selected points)
      if ($shouldShowConnectionCheckbox && $diagramData) {
        const pointIris = Array.from($interactionState.selectedPoints);
        const point1 = $diagramData.points.find(p => p.iri === pointIris[0]);
        const point2 = $diagramData.points.find(p => p.iri === pointIris[1]);
        
        if (point1 && point2) {
          // Calculate midpoint in world coordinates
          const midpoint = {
            x: (point1.x + point2.x) / 2,
            y: (point1.y + point2.y) / 2
          };
          
          // Convert to screen coordinates
          position = worldToScreen(midpoint.x, midpoint.y, viewTransform);
        }
      }
    });
    
    // Watch changes in viewTransform
    $effect(() => {
      // Update position if visible
      if (isVisible && $diagramData) {
        const pointIris = Array.from($interactionState.selectedPoints);
        const point1 = $diagramData.points.find(p => p.iri === pointIris[0]);
        const point2 = $diagramData.points.find(p => p.iri === pointIris[1]);
        
        if (point1 && point2) {
          // Calculate midpoint in world coordinates
          const midpoint = {
            x: (point1.x + point2.x) / 2,
            y: (point1.y + point2.y) / 2
          };
          
          // Convert to screen coordinates
          position = worldToScreen(midpoint.x, midpoint.y, viewTransform);
        }
      }
    });
    
    // Handle checkbox change
    async function handleChange(event: Event) {
      const target = event.target as HTMLInputElement;
      const newValue = target.checked;
      
      if ($diagramData) {
        const pointIris = Array.from($interactionState.selectedPoints);
        
        if (pointIris.length === 2) {
          // Toggle the connection
          await serviceRegistry.gluePointService.toggleConnection(pointIris);
        }
      }
    }
  </script>
  
  {#if isVisible}
    <div 
      class="connection-checkbox" 
      style="left: {position.x}px; top: {position.y}px;"
    >
      <label for={checkboxId}>
        <input 
          type="checkbox" 
          id={checkboxId} 
          checked={isChecked} 
          onchange={handleChange}
        />
        Connected
      </label>
    </div>
  {/if}
  
  <style>
    .connection-checkbox {
      position: absolute;
      background-color: rgba(255, 255, 255, 0.85);
      padding: 2px 8px;
      border-radius: 3px;
      border: 1px solid #007bff;
      font-size: 12px;
      z-index: 10;
      pointer-events: auto;
      white-space: nowrap;
      transform: translate(-50%, -100%);
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
      margin-top: -15px;
    }
    
    label {
      display: flex;
      align-items: center;
      gap: 5px;
      cursor: pointer;
    }
    
    input[type="checkbox"] {
      margin: 0;
    }
  </style>