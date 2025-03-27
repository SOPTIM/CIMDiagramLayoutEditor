<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import type { DiagramModel } from '@/core/models/DiagramModel';
    import type { ViewTransform } from '@/core/models/types';
    import { canvasService } from '../../canvas/CanvasService';
    
    // Props
    let { 
      navigate,
      diagram = null,
      width = 200,
      height = 150,
      visible = true,
     } : {
      navigate: (x: number, y: number) => void,
      diagram: DiagramModel | null,
      viewTransform: ViewTransform,
      canvasSize: { width: number; height: number },
      width: number,
      height: number,
      visible: boolean
     } = $props();
    
    
    // Local state
    let mapCanvas: HTMLCanvasElement;
    let isDragging = false;
    
    // Resize handlers
    let isResizing = false;
    let resizeStartPos = { x: 0, y: 0 };
    let initialSize = { width: 0, height: 0 };
    
    // Initialize the map
    onMount(() => {
      // Register the canvas with the canvas service
      if (mapCanvas) {
        canvasService.setMiniMapCanvas(mapCanvas);
      }
    });
    
    // Clean up on component destroy
    onDestroy(() => {
      if (isResizing) {
        document.removeEventListener('mousemove', handleResizeMove);
        document.removeEventListener('mouseup', endResize);
      }
    });
    
    
    $effect(() => {

      // Watch for changes in diagram
      if (diagram && mapCanvas) {
        canvasService.setMiniMapCanvas(mapCanvas);
      }

      // Watch for changes in map size
      if (width && height && mapCanvas) {
        mapCanvas.width = width;
        mapCanvas.height = height;
        
        // The canvasService will handle the rendering
        if (diagram) {
          canvasService.setMiniMapCanvas(mapCanvas);
        }
      }
    });
    
    // Handle mouse events
    function handleMouseDown(event: MouseEvent): void {
      if (!diagram) return;
      
      isDragging = true;
      
      // Get mouse position relative to the map
      const rect = mapCanvas.getBoundingClientRect();
      const mapX = event.clientX - rect.left;
      const mapY = event.clientY - rect.top;
      
      // Navigate to this position
      navigateToMapPoint(mapX, mapY);
    }
    
    function handleMouseMove(event: MouseEvent): void {
      if (!diagram) return;
            
      // Only handle movement if dragging
      if (isDragging) {
        // Get mouse position relative to the map
        const rect = mapCanvas.getBoundingClientRect();
        const mapX = event.clientX - rect.left;
        const mapY = event.clientY - rect.top;
        
        // Navigate to this position
        navigateToMapPoint(mapX, mapY);
      }
      
      // Update cursor
      mapCanvas.style.cursor = 'pointer';
    }
    
    function handleMouseUp(): void {
      isDragging = false;
    }
    
    function handleMouseLeave(): void {
      isDragging = false;
      // Reset cursor
      mapCanvas.style.cursor = 'default';
    }
    
    // Navigate to point on map
    function navigateToMapPoint(mapX: number, mapY: number): void {
      if (!diagram) return;
      
      // Get the bounds of the diagram
      const bounds = canvasService.getDiagramBounds(diagram);
      
      // Calculate the scale to fit the entire diagram in the minimap
      const padding = 10; // pixels
      const scale = canvasService.calculateFitScale(bounds, width, height, padding);
      
      // Convert map coordinates to world coordinates
      const worldX = bounds.minX + (mapX - padding) / scale;
      const worldY = bounds.minY + (mapY - padding) / scale;
      
      // Dispatch the navigation event
      navigate(worldX, worldY);
    }
    
    // Resize handlers
    function startResize(event: MouseEvent): void {
      event.preventDefault();
      event.stopPropagation();
      isResizing = true;
      resizeStartPos = { x: event.clientX, y: event.clientY };
      initialSize = { width, height };
      
      document.addEventListener('mousemove', handleResizeMove);
      document.addEventListener('mouseup', endResize);
    }
    
    function handleResizeMove(event: MouseEvent): void {
      if (!isResizing) return;
      
      // Calculate deltas
      const dx = resizeStartPos.x - event.clientX;
      const dy = resizeStartPos.y - event.clientY;
      
      // Update dimensions (minimum size of 100x100)
      width = Math.max(100, initialSize.width + dx);
      height = Math.max(100, initialSize.height + dy);
    }
    
    function endResize(): void {
      isResizing = false;
      document.removeEventListener('mousemove', handleResizeMove);
      document.removeEventListener('mouseup', endResize);
    }
  </script>
  
  <div class="navigation-map-container" class:visible={visible && !!diagram}>
    <div class="navigation-map" style="width: {width}px; height: {height}px;">
      <canvas
        bind:this={mapCanvas}
        width={width}
        height={height}
        onmousedown={handleMouseDown}
        onmousemove={handleMouseMove}
        onmouseup={handleMouseUp}
        onmouseleave={handleMouseLeave}
      ></canvas>
      
      <button 
        class="resize-handle" 
        onmousedown={startResize} 
        aria-label="Resize navigation map"
      ></button>
    </div>
  </div>
  
  <style>
    .navigation-map-container {
      position: absolute;
      bottom: 20px;
      right: 20px;
      z-index: 100;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.2s ease;
    }
    
    .navigation-map-container.visible {
      opacity: 0.8;
      pointer-events: all;
    }
    
    .navigation-map-container:hover {
      opacity: 1;
    }
    
    .navigation-map {
      position: relative;
      border-radius: 3px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
      user-select: none;
      background-color: rgba(240, 240, 240, 0.9);
      overflow: hidden;
    }
    
    canvas {
      display: block;
      width: 100%;
      height: 100%;
    }
        
    .resize-handle {
      position: absolute;
      top: 0;
      left: 0;
      width: 20px;
      height: 20px;
      cursor: nwse-resize;
      background: linear-gradient(
        315deg,
        transparent 0%,
        transparent 50%,
        #999 50%,
        #999 60%,
        transparent 60%,
        transparent 70%,
        #999 70%,
        #999 80%,
        transparent 80%,
        transparent 90%,
        #999 90%,
        #999 100%
      );
      border: none;
      padding: 0;
    }
  </style>