import { writable, get } from 'svelte/store';
import type { PointModel } from '@/core/models/PointModel';

// Store for tracking the hovered point
export const hoveredPoint = writable<PointModel | null>(null);
export const showPointTooltip = writable<boolean>(false);
export const isTooltipPinned = writable<boolean>(false);
export const isTooltipHovered = writable<boolean>(false);

// Tooltip functions
export function showTooltipForPoint(point: PointModel): void {
  hoveredPoint.set(point);
  showPointTooltip.set(true);
}

export function hideTooltipIfNotPinned(): void {
  // Only hide if neither pinned nor hovered
  if (!get(isTooltipPinned) && !get(isTooltipHovered)) {
    // Add a slight delay to allow for mouse movement to the tooltip
    setTimeout(() => {
      // Check again to see if it's been pinned or hovered during the delay
      if (!get(isTooltipPinned) && !get(isTooltipHovered)) {
        showPointTooltip.set(false);
      }
    }, 300);
  }
}

export function hideTooltip(): void {
  hoveredPoint.set(null);
  showPointTooltip.set(false);
  isTooltipPinned.set(false);
  isTooltipHovered.set(false);
}

export function setTooltipPinned(pinned: boolean): void {
  isTooltipPinned.set(pinned);
}

export function setTooltipHovered(hovered: boolean): void {
  isTooltipHovered.set(hovered);
}