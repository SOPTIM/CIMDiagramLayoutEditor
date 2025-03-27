<script lang="ts">
    import { onMount } from 'svelte';
    import type { Point2D, ViewTransform } from '@/core/models/types';
    import type { DiagramObjectModel } from '../../../core/models/DiagramModel';
    import { worldToScreen } from '@/utils/geometry';
    import { serviceRegistry } from '@/services/ServiceRegistry';
    
    // Props
    export let object: DiagramObjectModel;
    export let point: Point2D;
    export let viewTransform: ViewTransform;
    export let visible: boolean = false;

    // State
    let screenPosition: Point2D = { x: 0, y: 0 };
    let isPolygon: boolean = object?.isPolygon || false;
    let checkboxId = `polygon-${Math.random().toString(36).substring(2, 9)}`;
    
    // Watch for property and position changes
    $: if (object && point && viewTransform) {
      updatePosition();
      isPolygon = object.isPolygon;
    }
    
    // Watch for changes in the view transform
    $: if (viewTransform) {
      updatePosition();
    }
    
    // Update checkbox position based on point position and view transform
    function updatePosition() {
      screenPosition = worldToScreen(point.x, point.y, viewTransform);
    }
    
    // Handle checkbox change
    function handleChange(event: Event) {
      const target = event.target as HTMLInputElement;
      const newValue = target.checked;
    
      const objectService = serviceRegistry.objectService;
      objectService.togglePolygonProperty(object, newValue);
    }
    
    onMount(() => {
      updatePosition();
    });
  </script>
  
  {#if visible}
    <div 
      class="polygon-checkbox" 
      style="left: {screenPosition.x + 15}px; top: {screenPosition.y - 15}px;"
    >
      <label for={checkboxId}>
        <input 
          type="checkbox" 
          id={checkboxId} 
          checked={isPolygon} 
          onchange={handleChange}
        />
        Polygon
      </label>
    </div>
  {/if}
  
  <style>
    .polygon-checkbox {
      position: absolute;
      background-color: rgba(255, 255, 255, 0.85);
      padding: 2px 5px;
      border-radius: 3px;
      border: 1px solid #aaa;
      font-size: 12px;
      z-index: 10;
      pointer-events: auto;
      white-space: nowrap;
      transform: translate(0, -100%);
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
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