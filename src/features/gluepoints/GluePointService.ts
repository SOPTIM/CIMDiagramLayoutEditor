import { get } from 'svelte/store';
import { v4 as uuidv4 } from 'uuid';
import { SparqlService } from '@/services/SparqlService';
import type { GluePointModel } from '@/core/models/GluePointModel';
import type { DiagramService } from '@/features/diagram/DiagramService';

// Import state from feature modules
import { diagramData, cimNamespace } from '../diagram/DiagramState';
import { setLoading, updateStatus } from '../ui/UIState';
import type { GluePointQueryBuilder } from '@/queries/GluePointQueryBuilder ';
import { selectedGluePoint } from './GluePointState';
import { interactionState, clearSelection, togglePointSelection } from '../interaction/InteractionState';

export class GluePointService {
  constructor(
      private sparqlService: SparqlService,
      private gluePointQueryBuilder: GluePointQueryBuilder,
      private diagramService: DiagramService
  ) {}

  /**
   * Get the parent diagram object IRIs for a set of points
   *
   * @param pointIris - Array of point IRIs
   * @returns Set of object IRIs
   */
  private getParentObjectIris(pointIris: string[]): Set<string> {
    const diagram = get(diagramData);
    if (!diagram) return new Set<string>();

    const objectIris = new Set<string>();

    pointIris.forEach(pointIri => {
      const point = diagram.points.find(p => p.iri === pointIri);
      if (point && point.parentObject) {
        objectIris.add(point.parentObject.iri);
      }
    });

    return objectIris;
  }

  /**
   * Check if points are from different diagram objects
   *
   * @param pointIris - Array of point IRIs
   * @returns True if points are from at least two different objects
   */
  private arePointsFromDifferentObjects(pointIris: string[]): boolean {
    return this.getParentObjectIris(pointIris).size >= 2;
  }

  /**
   * Select all points connected to a glue point
   *
   * @param gluePointIri - Glue point IRI
   */
  public selectConnectedPoints(gluePointIri: string): void {
    const diagram = get(diagramData);
    if (!diagram) return;

    // Find the glue point
    const gluePoint = diagram.gluePoints.find(gp => gp.iri === gluePointIri);
    if (!gluePoint) return;

    // Clear current selection
    clearSelection();

    // Select all connected points
    gluePoint.connectedPoints.forEach(pointIri => {
      togglePointSelection(pointIri);
    });
  }

  /**
   * Get the visual center point for a glue point
   *
   * @param gluePointIri - Glue point IRI
   * @returns Center position or null if not found
   */
  public getGluePointCenter(gluePointIri: string): {x: number, y: number} | null {
    const diagram = get(diagramData);
    if (!diagram) return null;

    // Find the glue point
    const gluePoint = diagram.gluePoints.find(gp => gp.iri === gluePointIri);
    if (!gluePoint || gluePoint.connectedPoints.size === 0) return null;

    // Calculate center point
    let sumX = 0;
    let sumY = 0;
    let count = 0;

    gluePoint.connectedPoints.forEach(pointIri => {
      const point = diagram.points.find(p => p.iri === pointIri);
      if (point) {
        sumX += point.x;
        sumY += point.y;
        count++;
      }
    });

    if (count === 0) return null;

    return {
      x: sumX / count,
      y: sumY / count
    };
  }

  /**
   * Create a glue point between diagram points
   *
   * @param pointIris - Array of point IRIs to connect
   * @returns The created glue point or null on failure
   */
  async createGluePoint(pointIris: string[]): Promise<GluePointModel | null> {
    if (pointIris.length < 2) {
      updateStatus('At least two points are required to create a glue point');
      return null;
    }

    // Validate points are from different objects
    if (!this.arePointsFromDifferentObjects(pointIris)) {
      updateStatus('Glue points must connect points from different diagram objects');
      return null;
    }

    const currentDiagram = get(diagramData);
    if (!currentDiagram) return null;

    // Generate a new IRI for the glue point
    const gluePointIri = `urn:uuid:${uuidv4()}`;

    try {
      setLoading(true);
      updateStatus('Creating glue point...');

      // Get the current namespace
      const namespace = get(cimNamespace);

      // Create the glue point in the model
      const gluePoint = currentDiagram.createGluePoint(pointIris, gluePointIri);

      // Persist to database
      const query = this.gluePointQueryBuilder.buildCreateGluePointQuery(
          gluePointIri,
          pointIris,
          namespace
      );

      await this.sparqlService.executeUpdate(query);

      // Update the UI state
      diagramData.set(currentDiagram);

       // Set the newly created glue point as selected
      selectedGluePoint.set(gluePointIri);
      
      updateStatus('Glue point created successfully');
      return gluePoint;

    } catch (error) {
      console.error('Error creating glue point:', error);
      updateStatus(`Error: ${error instanceof Error ? error.message : String(error)}`);

      // Reload the diagram on error to restore correct state
      await this.diagramService.reloadDiagram();
      return null;

    } finally {
      setLoading(false);
    }
  }

  /**
   * Remove a glue point
   *
   * @param gluePointIri - Glue point IRI to remove
   * @returns True if successful
   */
  async removeGluePoint(gluePointIri: string): Promise<boolean> {
    const currentDiagram = get(diagramData);
    if (!currentDiagram) return false;

    const gluePoint = currentDiagram.gluePoints.find(gp => gp.iri === gluePointIri);
    if (!gluePoint) {
      updateStatus('Glue point not found');
      return false;
    }

    try {
      setLoading(true);
      updateStatus('Removing glue point...');

      // Get the current namespace
      const namespace = get(cimNamespace);

      // Remove from model
      currentDiagram.removeGluePoint(gluePointIri);

      // Persist to database
      const query = this.gluePointQueryBuilder.buildRemoveGluePointQuery(
          gluePointIri,
          namespace
      );

      await this.sparqlService.executeUpdate(query);

      // Update the UI state
      diagramData.set(currentDiagram);

      updateStatus('Glue point removed successfully');
      return true;

    } catch (error) {
      console.error('Error removing glue point:', error);
      updateStatus(`Error: ${error instanceof Error ? error.message : String(error)}`);

      // Reload the diagram on error to restore correct state
      await this.diagramService.reloadDiagram();
      return false;

    } finally {
      setLoading(false);
    }
  }

  /**
   * Add a point to an existing glue point
   *
   * @param pointIri - Point IRI to add
   * @param gluePointIri - Glue point IRI to add to
   * @returns True if successful
   */
  async addPointToGluePoint(pointIri: string, gluePointIri: string): Promise<boolean> {
    const currentDiagram = get(diagramData);
    if (!currentDiagram) return false;

    const gluePoint = currentDiagram.gluePoints.find(gp => gp.iri === gluePointIri);
    if (!gluePoint) {
      updateStatus('Glue point not found');
      return false;
    }

    // Check if point is already connected to this glue point
    if (gluePoint.hasPoint(pointIri)) {
      updateStatus('Point is already connected to this glue point');
      return false;
    }

    // Get all points that would be in this glue point after adding the new one
    const newPointSet = new Set(gluePoint.connectedPoints);
    newPointSet.add(pointIri);

    // Verify points would still be from different objects
    if (!this.arePointsFromDifferentObjects(Array.from(newPointSet))) {
      updateStatus('Cannot add point: glue points must connect points from different objects');
      return false;
    }

    try {
      setLoading(true);
      updateStatus('Adding point to glue point...');

      // Get the current namespace
      const namespace = get(cimNamespace);

      // Add to model
      gluePoint.addPoint(pointIri);
      currentDiagram.pointToGluePointMap.set(pointIri, gluePointIri);

      // Persist to database
      const query = this.gluePointQueryBuilder.buildAddPointToGluePointQuery(
          pointIri,
          gluePointIri,
          namespace
      );

      await this.sparqlService.executeUpdate(query);

      // Update the UI state
      diagramData.set(currentDiagram);

      updateStatus('Point added to glue point successfully');
      return true;

    } catch (error) {
      console.error('Error adding point to glue point:', error);
      updateStatus(`Error: ${error instanceof Error ? error.message : String(error)}`);

      // Reload the diagram on error to restore correct state
      await this.diagramService.reloadDiagram();
      return false;

    } finally {
      setLoading(false);
    }
  }

  /**
   * Remove a point from a glue point
   *
   * @param pointIri - Point IRI to remove
   * @param gluePointIri - Glue point IRI to remove from
   * @returns True if successful
   */
  async removePointFromGluePoint(pointIri: string, gluePointIri: string): Promise<boolean> {
    const currentDiagram = get(diagramData);
    if (!currentDiagram) return false;

    const gluePoint = currentDiagram.gluePoints.find(gp => gp.iri === gluePointIri);
    if (!gluePoint) {
      updateStatus('Glue point not found');
      return false;
    }

    // Check if point is connected to this glue point
    if (!gluePoint.hasPoint(pointIri)) {
      updateStatus('Point is not connected to this glue point');
      return false;
    }

    // Get remaining points after removal
    const remainingPoints = new Set(gluePoint.connectedPoints);
    remainingPoints.delete(pointIri);

    // Check if removing would result in invalid glue point (less than 2 points or all from same object)
    if (remainingPoints.size < 2 || !this.arePointsFromDifferentObjects(Array.from(remainingPoints))) {
      // Instead of failing, we'll remove the entire glue point
      return await this.removeGluePoint(gluePointIri);
    }

    try {
      setLoading(true);
      updateStatus('Removing point from glue point...');

      // Get the current namespace
      const namespace = get(cimNamespace);

      // Remove from model
      gluePoint.removePoint(pointIri);
      currentDiagram.pointToGluePointMap.delete(pointIri);

      // Persist to database
      const query = this.gluePointQueryBuilder.buildRemovePointFromGluePointQuery(
          pointIri,
          gluePointIri,
          namespace
      );

      await this.sparqlService.executeUpdate(query);

      // Update the UI state
      diagramData.set(currentDiagram);

      updateStatus('Point removed from glue point successfully');
      return true;

    } catch (error) {
      console.error('Error removing point from glue point:', error);
      updateStatus(`Error: ${error instanceof Error ? error.message : String(error)}`);

      // Reload the diagram on error to restore correct state
      await this.diagramService.reloadDiagram();
      return false;

    } finally {
      setLoading(false);
    }
  }

  /**
   * Create a glue point from multiple selected points
   * Returns true if successful
   */
  async createGluePointFromSelectedPoints(): Promise<boolean> {
    const selectedPoints = Array.from(get(interactionState).selectedPoints);

    if (selectedPoints.length < 2) {
      updateStatus('Select at least two points to create a glue point');
      return false;
    }

    // Validate points are from different objects
    if (!this.arePointsFromDifferentObjects(selectedPoints)) {
      updateStatus('Glue points must connect points from different diagram objects');
      return false;
    }

    // Create the glue point
    const result = await this.createGluePoint(selectedPoints);
    return !!result;
  }

  /**
   * Handle keyboard delete operation on glue points
   */
  async handleDeleteKeyOnGluePoint(): Promise<boolean> {
    const diagram = get(diagramData);
    const selectedPoints = Array.from(get(interactionState).selectedPoints);

    if (!diagram || selectedPoints.length === 0) return false;

    // Check if any of the selected points are part of a glue point
    const gluePointIris = new Set<string>();

    selectedPoints.forEach(pointIri => {
      const gluePointIri = diagram.pointToGluePointMap.get(pointIri);
      if (gluePointIri) {
        gluePointIris.add(gluePointIri);
      }
    });

    if (gluePointIris.size === 0) return false;

    // Confirm with the user
    const confirmDelete = window.confirm(
        `This will delete ${gluePointIris.size} glue point(s). Continue?`
    );

    if (!confirmDelete) return false;

    // Delete all the identified glue points
    let success = true;
    for (const gluePointIri of gluePointIris) {
      const result = await this.removeGluePoint(gluePointIri);
      if (!result) success = false;
    }

    return success;
  }
}