import type { DiagramModel } from '@/core/models/DiagramModel';
import type { 
  InteractionState, 
  ViewTransform,
  Bounds
} from '@/core/models/types';
import { AppConfig } from '@/core/config/AppConfig';
import { getDynamicSize } from '@/utils/geometry';
import { 
  renderSelectionRectangle, 
  renderLineOrPolygon,
  renderPoint,
  renderTextObject,
  renderGrid
} from '@/utils/canvas';
import { get } from 'svelte/store';
import { gridEnabled, gridSize, viewTransform } from '../canvas/CanvasState';
import { diagramData } from '../diagram/DiagramState';
import { interactionState } from '../interaction/InteractionState';

/**
 * Service for canvas rendering
 */
export class CanvasService {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private miniMapCanvas: HTMLCanvasElement | null = null;
  private miniMapCtx: CanvasRenderingContext2D | null = null;
  
  constructor() {
    // Subscribe to gridEnabled changes to trigger re-render
    gridEnabled.subscribe(() => {
      this.reRender();
    });
    // Subscribe to gridSize changes to trigger re-render
    gridSize.subscribe(() => {
      this.reRender();
    });    
  }

  /**
   * Re-render the canvas
   */
  reRender() {
    const diagram = get(diagramData);
    const view = get(viewTransform);
    const interaction = get(interactionState);
    if (this.canvas && diagram) {
      this.render(diagram, view, interaction);
    }
  }

  /**
   * Set main canvas element
   * 
   * @param canvas - Canvas HTML element
   */
  setCanvas(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
  }
  
  /**
   * Set minimap canvas element
   * 
   * @param canvas - MiniMap Canvas HTML element
   */
  setMiniMapCanvas(canvas: HTMLCanvasElement): void {
    this.miniMapCanvas = canvas;
    this.miniMapCtx = canvas.getContext('2d');
    
    // If we already have data, render the minimap with current view transform
    const diagram = get(diagramData);
    const currentViewTransform = get(viewTransform);
    if (diagram && this.miniMapCtx) {
      this.renderMiniMap(diagram, currentViewTransform);
    }
  }
  
  /**
   * Get the bounds of a diagram
   * 
   * @param diagram - The diagram model
   * @returns The bounds with padding
   */
  getDiagramBounds(diagram: DiagramModel): Bounds {
    const bounds = diagram.getBounds();
    // Add padding
    const padding = 0.05; // 5% padding
    const width = bounds.maxX - bounds.minX;
    const height = bounds.maxY - bounds.minY;
    
    return {
      minX: bounds.minX - width * padding,
      minY: bounds.minY - height * padding,
      maxX: bounds.maxX + width * padding,
      maxY: bounds.maxY + height * padding
    };
  }
  
  /**
   * Calculate scale to fit bounds in canvas
   * 
   * @param bounds - Bounds to fit
   * @param canvasWidth - Canvas width
   * @param canvasHeight - Canvas height
   * @param padding - Padding in pixels
   * @returns Scale factor
   */
  calculateFitScale(bounds: Bounds, canvasWidth: number, canvasHeight: number, padding: number = 10): number {
    const width = bounds.maxX - bounds.minX;
    const height = bounds.maxY - bounds.minY;
    
    if (width === 0 || height === 0) {
      return 1;
    }
    
    const availableWidth = canvasWidth - 2 * padding;
    const availableHeight = canvasHeight - 2 * padding;
    
    const scaleX = availableWidth / width;
    const scaleY = availableHeight / height;
    
    return Math.min(scaleX, scaleY);
  }
  
  /**
   * Render the diagram to the canvas
   * 
   * @param diagram - Diagram model
   * @param viewTransform - View transformation
   * @param interactionState - Current interaction state
   */
  render(
    diagram: DiagramModel | null,
    viewTransform: ViewTransform,
    interactionState: InteractionState
  ): void {
    if (!this.canvas || !this.ctx) return;
    
    // Clear canvas
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    
    if (!diagram || diagram.objects.length === 0) {
      this.ctx.restore();
      return;
    }
    
    // Apply view transform
    this.ctx.save();
    this.ctx.translate(viewTransform.offsetX, viewTransform.offsetY);
    this.ctx.scale(viewTransform.scale, viewTransform.scale);

    // Render grid if enabled
    const isGridEnabled = get(gridEnabled);
    if (isGridEnabled) {
      renderGrid(
        this.ctx, 
        viewTransform, 
        this.canvas.width, 
        this.canvas.height, 
        get(gridSize)
      );
    }
    
    // Sort objects by drawing order
    const sortedObjects = [...diagram.objects].sort((a, b) => a.drawingOrder - b.drawingOrder);
    
    // Calculate point radius based on zoom level
    const pointRadius = getDynamicSize(
      AppConfig.canvas.pointSize,
      viewTransform.scale
    );
    
    // Render each object
    for (const object of sortedObjects) {
      if (object.points.length === 0) {
        continue;
      }
      
      if (object.points.length === 1) {
        // Render single point as a dot
        renderPoint(
          this.ctx,
          object.points[0],
          pointRadius,
          interactionState.selectedPoints.has(object.points[0].iri),
          true
        );
      } else {
        // Render connected points
        renderLineOrPolygon(
          this.ctx,
          object,
          interactionState.selectedPoints,
          viewTransform
        );
      }
      
      // Render text for TextDiagramObject elements
      if (object.isText && object.textContent && object.points.length > 0) {
        renderTextObject(this.ctx, object, viewTransform);
      }
    }
    
    // Render selection rectangle if selecting
    if (
      interactionState.mode === 'selecting' &&
      interactionState.dragStart &&
      interactionState.dragEnd
    ) {
      renderSelectionRectangle(
        this.ctx,
        interactionState.dragStart,
        interactionState.dragEnd,
        viewTransform
      );
    }
    
    this.ctx.restore();
    
    // Also render the minimap if we have a minimap canvas
    if (this.miniMapCanvas && this.miniMapCtx) {
      this.renderMiniMap(diagram, viewTransform);
    }
  }
  
  /**
   * Render the minimap view of the diagram
   * 
   * @param diagram - Diagram model
   * @param mainViewTransform - Main view transform (for visible area)
   */
  renderMiniMap(
    diagram: DiagramModel,
    mainViewTransform?: ViewTransform
  ): void {
    if (!this.miniMapCanvas || !this.miniMapCtx) return;
    
    // Clear canvas
    this.miniMapCtx.clearRect(0, 0, this.miniMapCanvas.width, this.miniMapCanvas.height);
    
    // Draw background
    this.miniMapCtx.fillStyle = 'rgba(240, 240, 240, 0.9)';
    this.miniMapCtx.fillRect(0, 0, this.miniMapCanvas.width, this.miniMapCanvas.height);
    
    // Draw border
    this.miniMapCtx.strokeStyle = '#999';
    this.miniMapCtx.lineWidth = 1;
    this.miniMapCtx.strokeRect(0.5, 0.5, this.miniMapCanvas.width - 1, this.miniMapCanvas.height - 1);
    
    if (!diagram || diagram.objects.length === 0) {
      return;
    }
    
    // Get the bounds of the diagram
    const bounds = this.getDiagramBounds(diagram);
    
    // Calculate scale to fit the entire diagram in the minimap
    const padding = 10; // pixels
    const scale = this.calculateFitScale(bounds, this.miniMapCanvas.width, this.miniMapCanvas.height, padding);
    
    // Apply transform to fit the diagram
    this.miniMapCtx.save();
    this.miniMapCtx.translate(padding, padding);
    this.miniMapCtx.scale(scale, scale);
    this.miniMapCtx.translate(-bounds.minX, -bounds.minY);
    
    // Sort objects by drawing order
    const sortedObjects = [...diagram.objects].sort((a, b) => a.drawingOrder - b.drawingOrder);
    
    // Draw lines first with thin line width
    this.miniMapCtx.strokeStyle = 'rgba(0, 0, 0, 0.7)';
    this.miniMapCtx.lineWidth = 1 / scale;
    
    for (const object of sortedObjects) {
      if (object.points.length >= 2) {
        this.miniMapCtx.beginPath();
        this.miniMapCtx.moveTo(object.points[0].x, object.points[0].y);
        
        for (let i = 1; i < object.points.length; i++) {
          this.miniMapCtx.lineTo(object.points[i].x, object.points[i].y);
        }
        
        if (object.isPolygon) {
          this.miniMapCtx.closePath();
        }
        
        this.miniMapCtx.stroke();
      }
    }
    
    // Draw points
    this.miniMapCtx.fillStyle = 'blue';
    for (const object of sortedObjects) {
      if (object.points.length === 1) {
        const point = object.points[0];
        const radius = 2 / scale;
        this.miniMapCtx.beginPath();
        this.miniMapCtx.arc(point.x, point.y, radius, 0, Math.PI * 2);
        this.miniMapCtx.fill();
      }
    }
    
    // Draw the current view rectangle if we have a main view transform
    if (mainViewTransform && this.canvas) {
      const viewMinX = -mainViewTransform.offsetX / mainViewTransform.scale;
      const viewMinY = -mainViewTransform.offsetY / mainViewTransform.scale;
      const viewMaxX = (this.canvas.width - mainViewTransform.offsetX) / mainViewTransform.scale;
      const viewMaxY = (this.canvas.height - mainViewTransform.offsetY) / mainViewTransform.scale;
      
      this.miniMapCtx.strokeStyle = 'rgba(255, 0, 0, 0.8)';
      this.miniMapCtx.lineWidth = 2 / scale;
      this.miniMapCtx.strokeRect(
        viewMinX,
        viewMinY,
        viewMaxX - viewMinX,
        viewMaxY - viewMinY
      );
    }
    
    this.miniMapCtx.restore();
  }
}

// Create singleton instance for use throughout the application
export const canvasService = new CanvasService();