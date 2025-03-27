<script lang="ts">
  import { onMount } from 'svelte';
  import type { Point2D, ViewTransform } from '@/core/models/types';
  import { worldToScreen } from '@/utils/geometry';
  import { interactionState } from '../../interaction/InteractionState';
  import { shouldShowGlueCheckbox, isGlueChecked } from '../GluePointState';
  import { diagramData } from '../../diagram/DiagramState';
  import { serviceRegistry } from '@/services/ServiceRegistry';

  // Props
  export let viewTransform: ViewTransform;

  // Local state
  let position: Point2D = { x: 0, y: 0 };
  let checkboxId = `glue-${Math.random().toString(36).substring(2, 9)}`;
  let isVisible = false;
  let isChecked = false;

  // Watch changes in selected points
  $: {
    // Update visibility
    isVisible = $shouldShowGlueCheckbox;

    // Update checked state
    isChecked = $isGlueChecked;

    // Update position (calculated midpoint between selected points)
    if ($shouldShowGlueCheckbox && $diagramData) {
      updatePosition();
    }
  }

  // Watch changes in viewTransform
  $: if (viewTransform && isVisible) {
    updatePosition();
  }

  function updatePosition() {
    const pointIris = Array.from($interactionState.selectedPoints);
    let sumX = 0;
    let sumY = 0;
    let count = 0;

    pointIris.forEach(pointIri => {
      const point = $diagramData.points.find(p => p.iri === pointIri);
      if (point) {
        sumX += point.x;
        sumY += point.y;
        count++;
      }
    });

    if (count > 0) {
      // Calculate center in world coordinates
      const centerWorld = {
        x: sumX / count,
        y: sumY / count
      };

      // Convert to screen coordinates
      position = worldToScreen(centerWorld.x, centerWorld.y, viewTransform);
    }
  }

  // Handle checkbox change
  async function handleChange(event: Event) {
    const target = event.target as HTMLInputElement;
    const newValue = target.checked;

    const gluePointService = serviceRegistry.gluePointService;

    if (newValue) {
      // Create glue point from selected points
      await gluePointService.createGluePointFromSelectedPoints();
    } else {
      // Remove glue point connection
      // We need to find which glue point connects these points
      if ($diagramData) {
        const pointIris = Array.from($interactionState.selectedPoints);
        if (pointIris.length > 0) {
          const firstPoint = pointIris[0];
          const gluePointIri = $diagramData.pointToGluePointMap.get(firstPoint);
          if (gluePointIri) {
            await gluePointService.removeGluePoint(gluePointIri);
          }
        }
      }
    }
  }

  onMount(() => {
    updatePosition();
  });
</script>

{#if isVisible}
  <div
          class="glue-checkbox"
          style="left: {position.x}px; top: {position.y}px;"
  >
    <label for={checkboxId}>
      <input
              type="checkbox"
              id={checkboxId}
              checked={isChecked}
              on:change={handleChange}
      />
      glued
    </label>
  </div>
{/if}

<style>
  .glue-checkbox {
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