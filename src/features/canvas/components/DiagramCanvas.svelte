<script lang="ts">
  import { onMount } from 'svelte';
  import { viewTransform } from '../CanvasState';
  import { canvasService } from '../CanvasService';
  import { interactionState, positionUpdateEvent } from '@/features/interaction/InteractionState';
  import { 
    hoveredPoint, 
    showPointTooltip, 
    isTooltipPinned, 
    setTooltipPinned, 
    hideTooltip, 
    setTooltipHovered, 
    hideTooltipIfNotPinned 
  } from '@/features/tooltips/TooltipState';
  import { diagramData } from '../../diagram/DiagramState';
  import { canvasInteraction } from '../../interaction/actions/canvasInteraction';
  import { resizable } from '../../interaction/actions/resizable';
  import { resizeCanvas } from '@/utils/canvas';
  import NavigationMap from '../../navigation/components/NavigationMap.svelte';
  import PolygonCheckbox from '../../objects/components/PolygonCheckbox.svelte';
  import PointTooltip from '../../tooltips/components/PointTooltip.svelte';
  import type { MovePointsByDeltaData, Point2D } from '@/core/models/types';
  import type { PointModel } from '@/core/models/PointModel';
  import { serviceRegistry } from '@/services/ServiceRegistry';
  import GlueCheckbox from '../../gluepoints/components/GlueCheckbox.svelte';
  import GluePointVisualizer from "@/features/gluepoints/components/GluePointVisualizer.svelte";
  
  // Props
  export let showNavigationMap = true;
  
  // Canvas element reference
  let canvas: HTMLCanvasElement;
  let container: HTMLDivElement;
  
  // Canvas size
  let canvasSize = { width: 0, height: 0 };
  
  // Navigation map state
  let mapVisible = true;
  
  // Sync navigation map visibility with prop
  $: mapVisible = showNavigationMap;
  
  // For polygon checkbox
  let selectedPoint: PointModel | null = null;
  let showPolygonCheckbox = false;
  let checkboxPosition: Point2D = { x: 0, y: 0 };
  
  // Watch for selected points changes
  $: {
    if ($diagramData && $interactionState.selectedPoints.size === 1) {
      const pointIri = Array.from($interactionState.selectedPoints)[0];
      selectedPoint = $diagramData.points.find(p => p.iri === pointIri) || null;
      showPolygonCheckbox = selectedPoint !== null;
      if (selectedPoint) {
        checkboxPosition = { x: selectedPoint.x, y: selectedPoint.y };
      }
    } else {
      selectedPoint = null;
      showPolygonCheckbox = false;
    }
  }
  
  // Watch for positionUpdateEvent to update points in SPARQL
  $: if ($positionUpdateEvent) {
    handlePositionUpdate($positionUpdateEvent);
    // Reset event after handling
    positionUpdateEvent.set(null);
  }
  
  // Update canvas when diagram data, view transform or interaction state changes
  $: {
    if (canvas && $diagramData) {
      canvasService.render($diagramData, $viewTransform, $interactionState);
    }
  }
  
  // Handle canvas resize
  function handleResize() {
    if (canvas && container) {
      resizeCanvas(canvas, container);
      
      // Update canvas size for navigation map
      canvasSize = {
        width: canvas.width,
        height: canvas.height
      };
      
      // If diagram is loaded, auto-fit it
      if ($diagramData) {
        serviceRegistry.diagramService.autoFitDiagram({
          width: canvas.width,
          height: canvas.height
        });
      }
    }
  }
  
  // Handle position update event
  async function handlePositionUpdate(updateData: MovePointsByDeltaData) {
    if (updateData) {
      try {
        await serviceRegistry.pointService.updatePointPositions(updateData);
      } catch (error) {
        console.error('Failed to update point positions:', error);
      }
    }
  }
  
  // Handle closing the tooltip
  function handleTooltipClose() {
    hideTooltip();
  }
  
  // Handle tooltip pin state change
  function handleTooltipPin(pinned: boolean) {
    setTooltipPinned(pinned);
  }

  // Handle tooltip mouse events
  function handleTooltipEnter() {
    // Tell the AppState when the mouse enters the tooltip
    setTooltipHovered(true);
  }
  
  function handleTooltipLeave() {
    // Only tell the AppState when the mouse leaves if not pinned
    setTooltipHovered(false);
    
    // Hide the tooltip after a delay if it's not pinned
    if (!$isTooltipPinned) {
      hideTooltipIfNotPinned();
    }
  }
  
  // Handle navigation from the map
  function handleNavigate(x: number, y: number) {
    
    // Calculate new offset to center the view on the selected point
    const newOffsetX = -x * $viewTransform.scale + canvasSize.width / 2;
    const newOffsetY = -y * $viewTransform.scale + canvasSize.height / 2;
    
    // Update view transform
    viewTransform.set({
      scale: $viewTransform.scale,
      offsetX: newOffsetX,
      offsetY: newOffsetY
    });
  }
  
  onMount(() => {
    if (canvas) {
      // Initialize canvas service
      canvasService.setCanvas(canvas);
      
      // Initial resize
      handleResize();
    }
  });
</script>

<div class="canvas-container" bind:this={container} use:resizable={handleResize}>
  <canvas 
    id="diagram-canvas" 
    bind:this={canvas} 
    use:canvasInteraction
  ></canvas>
  
  <!-- Polygon checkbox that follows the selected point -->
  {#if showPolygonCheckbox && selectedPoint && selectedPoint.parentObject}
    <PolygonCheckbox 
      object={selectedPoint.parentObject}
      point={checkboxPosition}
      viewTransform={$viewTransform}
      visible={true}>
    </PolygonCheckbox>
  {/if}
  
  <!-- Point tooltip that appears on hover -->
  <PointTooltip 
    point={$hoveredPoint}
    viewTransform={$viewTransform}
    visible={$showPointTooltip}
    onClose={handleTooltipClose}
    onPin={handleTooltipPin}
    onEnter={handleTooltipEnter}
    onLeave={handleTooltipLeave}>
  </PointTooltip>

  <!-- Connection checkbox for creating/removing glue points -->
  <GlueCheckbox viewTransform={$viewTransform}></GlueCheckbox>
  <GluePointVisualizer viewTransform={$viewTransform}></GluePointVisualizer>

  <!-- Navigation map in the lower right corner -->
  <NavigationMap 
    diagram={$diagramData} 
    viewTransform={$viewTransform}
    canvasSize={canvasSize}
    visible={mapVisible}
    width={200}
    height={150}
    navigate={handleNavigate}>
  </NavigationMap>
</div>

<style>
  .canvas-container {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
  }
  
  canvas {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    display: block;
  }
</style>