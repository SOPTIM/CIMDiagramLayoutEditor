import { writable } from 'svelte/store';
import type { Point2D } from '@/core/models/types';

// UI state
export const isLoading = writable<boolean>(false);
export const statusText = writable<string>('Ready');
export const errorMessage = writable<string | null>(null);
export const coordinates = writable<Point2D>({ x: 0, y: 0 });

// UI helper functions
export function setLoading(loading: boolean): void {
  isLoading.set(loading);
}

export function updateStatus(text: string): void {
  statusText.set(text);
}

export function updateCoordinates(point: Point2D): void {
  coordinates.set({
    x: Math.round(point.x),
    y: Math.round(point.y)
  });
}