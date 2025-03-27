import { get } from 'svelte/store';
import { v4 as uuidv4 } from 'uuid';
import { SparqlService } from '@/services/SparqlService';
import type { GluePointModel } from '@/core/models/GluePointModel';
import type { DiagramService } from '@/features/diagram/DiagramService';

// Import state from feature modules
import { diagramData, cimNamespace } from '../diagram/DiagramState';
import { setLoading, updateStatus } from '../ui/UIState';
import type { GluePointQueryBuilder } from '@/queries/GluePointQueryBuilder ';

export class GluePointService {
  constructor(
    private sparqlService: SparqlService,
    private gluePointQueryBuilder: GluePointQueryBuilder,
    private diagramService: DiagramService
  ) {}

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
    
    try {
      setLoading(true);
      updateStatus('Removing point from glue point...');
      
      // Get the current namespace
      const namespace = get(cimNamespace);
      
      // Remove from model
      const shouldDeleteGluePoint = gluePoint.removePoint(pointIri);
      currentDiagram.pointToGluePointMap.delete(pointIri);
      
      // Persist to database
      const query = this.gluePointQueryBuilder.buildRemovePointFromGluePointQuery(
        pointIri,
        gluePointIri,
        namespace
      );
      
      await this.sparqlService.executeUpdate(query);
      
      // If the glue point has less than 2 points, remove it entirely
      if (shouldDeleteGluePoint) {
        await this.removeGluePoint(gluePointIri);
      } else {
        // Otherwise just update the UI state
        diagramData.set(currentDiagram);
      }
      
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
   * Toggle connection between two points (create or remove glue point)
   * 
   * @param pointIris - Array of exactly two point IRIs
   * @returns True if successful
   */
  async toggleConnection(pointIris: string[]): Promise<boolean> {
    if (pointIris.length !== 2) {
      updateStatus('Exactly two points are required to toggle a connection');
      return false;
    }
    
    const currentDiagram = get(diagramData);
    if (!currentDiagram) return false;
    
    const [point1Iri, point2Iri] = pointIris;
    
    // Check if points are already connected
    const gluePoint1 = currentDiagram.getGluePointForPoint(point1Iri);
    const gluePoint2 = currentDiagram.getGluePointForPoint(point2Iri);
    
    // If both points have the same glue point, remove the connection
    if (gluePoint1 && gluePoint2 && gluePoint1.iri === gluePoint2.iri) {
      // If the glue point has more than 2 points, just remove one point
      if (gluePoint1.pointCount > 2) {
        return await this.removePointFromGluePoint(point1Iri, gluePoint1.iri);
      } else {
        // Otherwise remove the whole glue point
        return await this.removeGluePoint(gluePoint1.iri);
      }
    } 
    // If points have different glue points or no glue points, create a new connection
    else {
      // If points already have glue points, we need to handle merging
      if (gluePoint1 && gluePoint2) {
        // Merge the two glue points
        return await this.mergeGluePoints(gluePoint1.iri, gluePoint2.iri);
      } 
      else if (gluePoint1) {
        // Add point2 to gluePoint1
        return await this.addPointToGluePoint(point2Iri, gluePoint1.iri);
      } 
      else if (gluePoint2) {
        // Add point1 to gluePoint2
        return await this.addPointToGluePoint(point1Iri, gluePoint2.iri);
      } 
      else {
        // Create a new glue point
        return !!(await this.createGluePoint([point1Iri, point2Iri]));
      }
    }
  }

  /**
   * Merge two glue points into one
   * 
   * @param gluePoint1Iri - First glue point IRI
   * @param gluePoint2Iri - Second glue point IRI
   * @returns True if successful
   */
  private async mergeGluePoints(gluePoint1Iri: string, gluePoint2Iri: string): Promise<boolean> {
    const currentDiagram = get(diagramData);
    if (!currentDiagram) return false;
    
    const gluePoint1 = currentDiagram.gluePoints.find(gp => gp.iri === gluePoint1Iri);
    const gluePoint2 = currentDiagram.gluePoints.find(gp => gp.iri === gluePoint2Iri);
    
    if (!gluePoint1 || !gluePoint2) {
      updateStatus('One or both glue points not found');
      return false;
    }
    
    try {
      setLoading(true);
      updateStatus('Merging glue points...');
      
      // Get all points from gluePoint2
      const pointsToMove = Array.from(gluePoint2.connectedPoints);
      
      // Add all points from gluePoint2 to gluePoint1
      for (const pointIri of pointsToMove) {
        await this.addPointToGluePoint(pointIri, gluePoint1Iri);
      }
      
      // Remove gluePoint2
      await this.removeGluePoint(gluePoint2Iri);
      
      updateStatus('Glue points merged successfully');
      return true;
      
    } catch (error) {
      console.error('Error merging glue points:', error);
      updateStatus(`Error: ${error instanceof Error ? error.message : String(error)}`);
      
      // Reload the diagram on error to restore correct state
      await this.diagramService.reloadDiagram();
      return false;
      
    } finally {
      setLoading(false);
    }
  }
}