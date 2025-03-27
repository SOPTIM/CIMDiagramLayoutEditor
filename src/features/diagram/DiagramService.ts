import { get } from 'svelte/store';
import type { CanvasSize, SparqlDiagramData } from '@/core/models/types';
import { DiagramModel } from '@/core/models/DiagramModel';
import { SparqlService } from '@/services/SparqlService';
import { DiagramQueryBuilder } from '@/queries/DiagramQueryBuilder';
import { isValidEndpoint } from '@/services/utils/sparql-utils';
import { addPaddingToBounds, calculateFitScale } from '@/utils/geometry';
import { AppConfig } from '@/core/config/AppConfig';

// Import state from feature modules
import { 
  diagramData, 
  diagramList, 
  cimNamespace,
  selectedDiagram
} from './DiagramState';
import { viewTransform, resetViewTransform } from '../canvas/CanvasState';
import { clearSelection } from '../interaction/InteractionState';
import { setLoading, updateStatus } from '../ui/UIState';

export class DiagramService {
  constructor(
    private sparqlService: SparqlService,
    private diagramQueryBuilder: DiagramQueryBuilder
  ) {}

  /**
   * Load all available diagrams
   */
  async loadDiagramProfiles(endpoint: string): Promise<SparqlDiagramData[]> {
    if (!isValidEndpoint(endpoint)) {
      throw new Error('Please enter a valid SPARQL endpoint URL');
    }
    
    setLoading(true);
    updateStatus('Loading diagram profiles...');
    
    try {
      // Set endpoint in SPARQL service
      this.sparqlService.setEndpoint(endpoint);
      
      // Get current namespace
      const namespace = get(cimNamespace);
      
      // Build and execute query
      const query = this.diagramQueryBuilder.buildDiagramsQuery(namespace);
      const response = await this.sparqlService.executeQuery(query);
      
      if (response.results.bindings.length === 0) {
        updateStatus('No diagrams found');
        diagramList.set([]);
        return [];
      }
      
      // Process results
      const diagrams = response.results.bindings.map((binding) => ({
        iri: binding.diagram.value,
        name: binding.name ? binding.name.value : binding.diagram.value
      }));
      
      // Update diagram list
      diagramList.set(diagrams);
      updateStatus(`Found ${diagrams.length} diagrams`);
      
      return diagrams;
    } catch (error) {
      console.error('Error loading diagram profiles:', error);
      updateStatus(`Error: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    } finally {
      setLoading(false);
    }
  }
  
  /**
   * Reload the current diagram without resetting the view
   */
  async reloadDiagram(): Promise<DiagramModel> {
    const diagramIri = get(selectedDiagram);
    return await this.loadDiagramLayout(diagramIri, false);
  }

  /**
   * Load and process diagram layout data
   */
  async loadDiagramLayout(diagramIri: string, resetView: boolean = true): Promise<DiagramModel> {
    if (!diagramIri) {
      throw new Error('Please select a diagram');
    }
    
    setLoading(true);
    updateStatus('Loading diagram layout data...');
    
    try {
      // Only reset view if specified (default is true for backward compatibility)
      if (resetView) {
        resetViewTransform();
      }
      clearSelection();
      
      // Get current namespace
      const namespace = get(cimNamespace);
      
      // Build and execute query
      const query = this.diagramQueryBuilder.buildDiagramLayoutQuery(diagramIri, namespace);
      const response = await this.sparqlService.executeQuery(query);
      
      // Process diagram data
      const diagram = DiagramModel.fromSparqlResults(response);
      
      // Update diagram data
      diagramData.set(diagram);
      
      updateStatus(`Loaded diagram with ${diagram.objects.length} objects and ${diagram.points.length} points`);
      
      return diagram;
    } catch (error) {
      console.error('Error loading diagram layout data:', error);
      updateStatus(`Error: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    } finally {
      setLoading(false);
    }
  }
  
  /**
   * Auto-fit the diagram to the canvas
   */
  autoFitDiagram(canvasSize: CanvasSize): void {
    const diagram = get(diagramData);
    
    if (!diagram || diagram.points.length === 0) {
      resetViewTransform();
      return;
    }
    
    // Get diagram bounds
    const bounds = diagram.getBounds();
    
    // Add padding
    const paddedBounds = addPaddingToBounds(bounds, AppConfig.view.padding);
    
    // Calculate scale
    const scale = calculateFitScale(
      paddedBounds,
      canvasSize.width,
      canvasSize.height,
      1.0 // Max scale
    );
    
    // Update view transform
    viewTransform.set({
      scale,
      offsetX: -paddedBounds.minX * scale,
      offsetY: -paddedBounds.minY * scale
    });
  }
}