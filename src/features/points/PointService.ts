import { v4 as uuidv4 } from 'uuid';
import { get } from 'svelte/store';
import type { DiagramObjectModel } from '@/core/models/DiagramObjectModel';
import type { Point2D, MovePointsByDeltaData } from '@/core/models/types';
import { PointModel } from '@/core/models/PointModel';
import { SparqlService } from '@/services/SparqlService';
import { PointQueryBuilder } from '@/queries/PointQueryBuilder';

// Import state from feature modules
import { diagramData, cimNamespace } from '../diagram/DiagramState';
import { setLoading, updateStatus } from '../ui/UIState';
import { clearSelection, togglePointSelection } from '../interaction/InteractionState';
import type { ObjectQueryBuilder } from '@/queries/ObjectQueryBuilder';
import type { DiagramService } from '../diagram/DiagramService';

export class PointService {
  constructor(
    private sparqlService: SparqlService,
    private pointQueryBuilder: PointQueryBuilder,
    private objectQueryBuilder: ObjectQueryBuilder,
    private diagramService: DiagramService
  ) {}

  /**
   * Add a new point to a line in the diagram
   */
  async addNewPointToLine(
    object: DiagramObjectModel,
    position: Point2D,
    insertIndex: number
  ): Promise<boolean> {
    if (!object || !position || insertIndex === undefined) return false;
    
    const currentDiagram = get(diagramData);
    if (!currentDiagram) return false;
    
    // Generate a new unique IRI for the point
    const newPointIri = `urn:uuid:${uuidv4()}`;

    try {
      setLoading(true);
      updateStatus('Adding new point...');
      
      // Create new point
      const newPoint = new PointModel(
        newPointIri,
        position.x,
        position.y,
        insertIndex, // Initial sequence number at insert position
        object
      );
      
      // Insert the point into the object's points array
      object.points.splice(insertIndex, 0, newPoint);
      
      // Update sequence numbers for all points in the object
      object.points.forEach((point, index) => {
        point.sequenceNumber = index;
      });
      
      // Add point to the diagram's points collection
      currentDiagram.points.push(newPoint);
      
      // Update the diagram in the UI
      diagramData.set(currentDiagram);
      
      // Get the current namespace
      const namespace = get(cimNamespace);
      
      // Create data for SPARQL update
      const pointUpdateData = {
        iri: newPointIri,
        objectIri: object.iri,
        x: position.x,
        y: position.y,
        sequenceNumber: insertIndex
      };
      
      // Prepare sequence number updates for all points in the object
      const sequenceUpdates = object.points.map(point => ({
        iri: point.iri,
        sequenceNumber: point.sequenceNumber
      }));
      
      // Persist changes to the database
      // First insert the new point
      const insertQuery = this.pointQueryBuilder.buildInsertPointQuery(
        pointUpdateData.iri,
        pointUpdateData.objectIri,
        pointUpdateData.x,
        pointUpdateData.y,
        pointUpdateData.sequenceNumber,
        namespace
      );
      
      await this.sparqlService.executeUpdate(insertQuery);
      
      // Then update all sequence numbers
      const updateSequenceQuery = this.pointQueryBuilder.buildUpdateSequenceNumbersQuery(
        sequenceUpdates,
        namespace
      );
      
      await this.sparqlService.executeUpdate(updateSequenceQuery);
      
      updateStatus('New point added');
      
      // Select the newly added point
      clearSelection();
      togglePointSelection(newPointIri);

      return true;
    } catch (error) {
      console.error('Error adding new point:', error);
      updateStatus(`Error: ${error instanceof Error ? error.message : String(error)}`);
      
      await this.diagramService.reloadDiagram();
      return false;
    } finally {
      setLoading(false);
    }
  }
  
  /**
   * Delete a point from a line in the diagram
   */
  async deletePointFromLine(point: PointModel): Promise<boolean> {
    if (!point) return false;
    
    const currentDiagram = get(diagramData);
    if (!currentDiagram) return false;
    
    // Get the parent object
    const object = point.parentObject;
    if (!object) {
      updateStatus('Cannot delete point: parent object not found');
      return false;
    }
    
    try {
      // Check if the point is first or last in its object
      const pointIndex = object.points.findIndex(p => p.iri === point.iri);
      
      // For non-polygon objects (lines), prevent deletion of first and last points
      if (!object.isPolygon && (pointIndex === 0 || pointIndex === object.points.length - 1)) {
        updateStatus('Cannot delete first or last point of a line');
        return false;
      }
      
      // At this point we know we can delete the point
      setLoading(true);
      updateStatus('Deleting point...');
      
      // Remove the point from the object's points array
      object.points.splice(pointIndex, 1);
      
      // Check if the object was a polygon and needs to be updated
      let needsPolygonUpdate = false;

      // If we have fewer than 3 points and it was a polygon, remove the polygon property      
      if(object.isPolygon && object.points.length < 3) {
        object.isPolygon = false;
        needsPolygonUpdate = true;
      }
      
      // Update sequence numbers for all remaining points
      object.points.forEach((p, index) => {
        p.sequenceNumber = index;
      });
      
      // Persist changes to the database

      // Get the current namespace
      const namespace = get(cimNamespace);
      
      // Prepare sequence number updates for all points in the object
      const sequenceUpdates = object.points.map((p: { iri: any; sequenceNumber: any; }) => ({
        iri: p.iri,
        sequenceNumber: p.sequenceNumber
      }));
      

      // Delete the point
      const deletePointQuery = this.pointQueryBuilder.buildDeletePointQuery(
        point.iri,
        namespace
      );
      await this.sparqlService.executeUpdate(deletePointQuery);

      // Update sequence numbers
       const updateSequenceQuery = this.pointQueryBuilder.buildUpdateSequenceNumbersQuery(
        sequenceUpdates,
        namespace
      );      
      await this.sparqlService.executeUpdate(updateSequenceQuery);

      // If the object was a polygon and now has fewer than 3 points, update the polygon property
      if (needsPolygonUpdate) {
        
        const updatePolygonQuery = this.objectQueryBuilder.buildUpdatePolygonPropertyQuery(
          object.iri,
          false,
          namespace
        );
        await this.sparqlService.executeUpdate(updatePolygonQuery);

      }

      // Update the diagram in the UI

       // Remove from diagram points collection
       const diagramPointIndex = currentDiagram.points.findIndex(p => p.iri === point.iri);
       if (diagramPointIndex >= 0) {
         currentDiagram.points.splice(diagramPointIndex, 1);
       }
       
       // Update the diagram in the UI
       diagramData.set(currentDiagram);
      
      updateStatus('Point deleted successfully');
      
      // Clear selection if the deleted point was selected
      clearSelection();
      
      return true;
    } catch (error) {
      console.error('Error deleting point:', error);
      updateStatus(`Error: ${error instanceof Error ? error.message : String(error)}`);
      
      await this.diagramService.reloadDiagram();
      return false;
    } finally {
      setLoading(false);
    }
  }
  
  /**
   * Update point positions in the diagram
   */
  async updatePointPositions(pointsAndVector: MovePointsByDeltaData): Promise<boolean> {
  
    if (pointsAndVector.pointIris.length === 0) {
      return false;
    }
    
    // Get the diagram data
    const currentDiagram = get(diagramData);
    if (!currentDiagram) return false;
    
    // Find all glued points that need to be updated
    const allPointsToUpdate = new Set<string>(pointsAndVector.pointIris);
    
    // For each selected point, add its glued points
    pointsAndVector.pointIris.forEach(pointIri => {
      const gluedPoints = currentDiagram.getGluedPoints(pointIri);
      gluedPoints.forEach(gluedPointIri => {
        allPointsToUpdate.add(gluedPointIri);
      });
    });
    
    // Create the updated movement data
    const updatedPointsAndVector: MovePointsByDeltaData = {
      pointIris: Array.from(allPointsToUpdate),
      deltaVector: pointsAndVector.deltaVector
    };
    
    setLoading(true);
    updateStatus('Updating point positions...');
    
    try {
      // Get current namespace
      const namespace = get(cimNamespace);
      // Build update query
      const query = this.pointQueryBuilder.buildUpdateDiagramPointPositionsByVectorQuery(updatedPointsAndVector, namespace);
      
      // Execute update
      await this.sparqlService.executeUpdate(query);
      
      updateStatus(`Updated ${updatedPointsAndVector.pointIris.length} points`);      
      return true;
    } catch (error) {
      console.error('Error updating point positions:', error);
      updateStatus(`Error: ${error instanceof Error ? error.message : String(error)}`);
      
      await this.diagramService.reloadDiagram();     
      return false;
    } finally {
      setLoading(false);
    }
  }
  
  /**
   * Update point positions with absolute coordinates
   */
  async updatePointPositionsAbsolute(
    updateData: { points: string[], newPositions: Point2D[] }
  ): Promise<boolean> {
    if (updateData.points.length === 0 || updateData.points.length !== updateData.newPositions.length) {
      return false;
    }
    
    setLoading(true);
    updateStatus('Updating point positions...');
    
    try {
      // Get current namespace
      const namespace = get(cimNamespace);
      
      const query = this.pointQueryBuilder.buildUpdateDiagramPointPositionsQuery(
        updateData.points,
        updateData.newPositions,
        namespace
      );

      // Execute update
      await this.sparqlService.executeUpdate(query);
      
      updateStatus(`Updated ${updateData.points.length} points`);
      return true;
    } catch (error) {
      console.error('Error updating point positions:', error);
      updateStatus(`Error: ${error instanceof Error ? error.message : String(error)}`);
      
      await this.diagramService.reloadDiagram();
      return false; 
    } finally {
      setLoading(false);
    }
  }
}