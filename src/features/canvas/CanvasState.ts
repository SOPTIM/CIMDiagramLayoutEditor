import { writable } from 'svelte/store';
import type { ViewTransform, Point2D } from '@/core/models/types';
import { AppConfig } from '@/core/config/AppConfig';

// View transformation state
export const viewTransform = writable<ViewTransform>({
  scale: AppConfig.view.initialScale,
  offsetX: AppConfig.view.initialOffsetX,
  offsetY: AppConfig.view.initialOffsetY
});

// Grid state
export const gridEnabled = writable<boolean>(AppConfig.grid.enabled);
export const gridSize = writable<number>(AppConfig.grid.size);

// View transformation functions
export function resetViewTransform(): void {
  viewTransform.set({
    scale: AppConfig.view.initialScale,
    offsetX: AppConfig.view.initialOffsetX,
    offsetY: AppConfig.view.initialOffsetY
  });
}

export function zoom(center: Point2D, delta: number): void {
  viewTransform.update(transform => {
    // Calculate zoom factor
    const zoomFactor = delta < 0 ? AppConfig.canvas.zoomFactor : 1 / AppConfig.canvas.zoomFactor;
    const newScale = transform.scale * zoomFactor;
    
    // Calculate new offsets to zoom at mouse position
    const newOffsetX = center.x - (center.x - transform.offsetX) * zoomFactor;
    const newOffsetY = center.y - (center.y - transform.offsetY) * zoomFactor;
    
    return {
      scale: newScale,
      offsetX: newOffsetX,
      offsetY: newOffsetY
    };
  });
}