import { writable, derived } from 'svelte/store';
import type { DiagramModel } from '@/core/models/DiagramModel';
import { CGMESVersion } from '@/core/models/types';
import { AppConfig } from '@/core/config/AppConfig';

// Core diagram state
export const diagramData = writable<DiagramModel | null>(null);
export const diagramList = writable<{iri: string, name: string}[]>([]);
export const selectedDiagram = writable<string>('');
export const cgmesVersion = writable<CGMESVersion>(CGMESVersion.V3_0);

// Derived state
export const cimNamespace = derived(
  cgmesVersion,
  $version => AppConfig.namespaces[$version]
);

// CGMES version functions
export function setCGMESVersion(version: CGMESVersion): void {
  cgmesVersion.set(version);
}