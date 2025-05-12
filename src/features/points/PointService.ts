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
import { clearSelection, togglePointSelection, interactionState } from '../interaction/InteractionState';
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

  // ========== TRANSFORMATION OPERATIONS ==========

  /**
   * Validate selected points for transformation operations
   */
  private validateSelectedPointsForTransformation(operation: string = 'transform'): {
    selectedPoints: PointModel[];
    validationError: string | null;
  } {
    const currentState = get(interactionState);
    const currentDiagram = get(diagramData);

    if (!currentDiagram || currentState.selectedPoints.size === 0) {
      return { selectedPoints: [], validationError: `Nothing selected to ${operation}` };
    }

    const selectedPointIris = Array.from(currentState.selectedPoints);
    const selectedPoints = currentDiagram.points.filter(p => selectedPointIris.includes(p.iri));

    if (selectedPoints.length === 0) {
      return { selectedPoints: [], validationError: `No valid points to ${operation}` };
    }

    return { selectedPoints, validationError: null };
  }

  /**
   * Calculate center point from a collection of points
   */
  private calculatePointsCenter(points: PointModel[]): Point2D {
    if (points.length === 0) {
      return { x: 0, y: 0 };
    }

    let sumX = 0;
    let sumY = 0;

    points.forEach(point => {
      sumX += point.x;
      sumY += point.y;
    });

    return {
      x: sumX / points.length,
      y: sumY / points.length
    };
  }

  /**
   * Get rotation trigonometric values
   */
  private getRotationTrigValues(degrees: number) {
    const radians = (degrees * Math.PI) / 180;
    return {
      sin: Math.sin(radians),
      cos: Math.cos(radians)
    };
  }

  /**
   * Calculate rotated positions for specific points
   */
  private calculateRotatedPositionsForPoints(
      points: PointModel[],
      center: Point2D,
      sin: number,
      cos: number
  ): { point: PointModel; newX: number; newY: number }[] {
    const pointsToRotate: { point: PointModel; newX: number; newY: number }[] = [];

    points.forEach(point => {
      // Apply rotation matrix
      const dx = point.x - center.x;
      const dy = point.y - center.y;
      const newX = center.x + (dx * cos - dy * sin);
      const newY = center.y + (dx * sin + dy * cos);

      pointsToRotate.push({ point, newX, newY });
    });

    return pointsToRotate;
  }

  /**
   * Calculate horizontally mirrored positions for specific points
   */
  private calculateHorizontallyMirroredPositionsForPoints(
      points: PointModel[],
      center: Point2D
  ): { point: PointModel; newX: number; newY: number }[] {
    const pointsToMirror: { point: PointModel; newX: number; newY: number }[] = [];

    points.forEach(point => {
      // Apply horizontal mirroring
      const newX = 2 * center.x - point.x;
      const newY = point.y; // Y coordinate stays the same for horizontal mirroring
      pointsToMirror.push({ point, newX, newY });
    });

    return pointsToMirror;
  }

  /**
   * Calculate vertically mirrored positions for specific points
   */
  private calculateVerticallyMirroredPositionsForPoints(
      points: PointModel[],
      center: Point2D
  ): { point: PointModel; newX: number; newY: number }[] {
    const pointsToMirror: { point: PointModel; newX: number; newY: number }[] = [];

    points.forEach(point => {
      // Apply vertical mirroring
      const newX = point.x; // X coordinate stays the same for vertical mirroring
      const newY = 2 * center.y - point.y;
      pointsToMirror.push({ point, newX, newY });
    });

    return pointsToMirror;
  }

  /**
   * Update local point positions in the model
   */
  private updateLocalPointPositions(pointsToUpdate: { point: PointModel; newX: number; newY: number }[]) {
    pointsToUpdate.forEach(({ point, newX, newY }) => {
      point.x = newX;
      point.y = newY;
    });

    // Update the diagram
    diagramData.set(get(diagramData));
  }

  /**
   * Prepare position update data for SPARQL
   */
  private preparePositionUpdateData(pointsToUpdate: { point: PointModel; newX: number; newY: number }[]) {
    return {
      points: pointsToUpdate.map(({ point }) => point.iri),
      newPositions: pointsToUpdate.map(({ newX, newY }) => ({ x: newX, y: newY }))
    };
  }

  /**
   * Handle transformation errors
   */
  private async handleTransformationError(error: any, operation: string = 'transformation') {
    console.error(`Error during ${operation}:`, error);
    updateStatus(`Error: ${error instanceof Error ? error.message : String(error)}`);

    await this.diagramService.reloadDiagram();
  }

  /**
   * Rotate selected points around their center
   */
  async rotateSelectedPoints(degrees: number): Promise<boolean> {
    const { selectedPoints, validationError } = this.validateSelectedPointsForTransformation('rotate');

    if (validationError) {
      updateStatus(validationError);
      return false;
    }

    // Calculate rotation center based on selected points only
    const center = this.calculatePointsCenter(selectedPoints);
    const { sin, cos } = this.getRotationTrigValues(degrees);

    // Start operation
    setLoading(true);
    updateStatus(`Rotating ${selectedPoints.length} points...`);

    try {
      // Calculate new positions for selected points only
      const pointsToRotate = this.calculateRotatedPositionsForPoints(selectedPoints, center, sin, cos);

      // Update local model first
      this.updateLocalPointPositions(pointsToRotate);

      // Prepare data for SPARQL update
      const updateData = this.preparePositionUpdateData(pointsToRotate);

      // Send update to server
      await this.updatePointPositionsAbsolute(updateData);

      updateStatus(`Rotated ${selectedPoints.length} points by ${degrees} degrees`);
      return true;
    } catch (error) {
      await this.handleTransformationError(error, 'rotation');
      return false;
    } finally {
      setLoading(false);
    }
  }

  /**
   * Mirror selected points horizontally around their center
   */
  async mirrorSelectedPointsHorizontally(): Promise<boolean> {
    const { selectedPoints, validationError } = this.validateSelectedPointsForTransformation('mirror');

    if (validationError) {
      updateStatus(validationError);
      return false;
    }

    // Calculate the center of the selected points only
    const center = this.calculatePointsCenter(selectedPoints);

    // Start operation
    setLoading(true);
    updateStatus(`Mirroring ${selectedPoints.length} points horizontally...`);

    try {
      // Calculate new positions for selected points only
      const pointsToMirror = this.calculateHorizontallyMirroredPositionsForPoints(selectedPoints, center);

      // Update local model first
      this.updateLocalPointPositions(pointsToMirror);

      // Prepare data for SPARQL update
      const updateData = this.preparePositionUpdateData(pointsToMirror);

      // Send update to server
      await this.updatePointPositionsAbsolute(updateData);

      updateStatus(`Mirrored ${selectedPoints.length} points horizontally`);
      return true;
    } catch (error) {
      await this.handleTransformationError(error, 'horizontal mirroring');
      return false;
    } finally {
      setLoading(false);
    }
  }

  /**
   * Mirror selected points vertically around their center
   */
  async mirrorSelectedPointsVertically(): Promise<boolean> {
    const { selectedPoints, validationError } = this.validateSelectedPointsForTransformation('mirror');

    if (validationError) {
      updateStatus(validationError);
      return false;
    }

    // Calculate the center of the selected points only
    const center = this.calculatePointsCenter(selectedPoints);

    // Start operation
    setLoading(true);
    updateStatus(`Mirroring ${selectedPoints.length} points vertically...`);

    try {
      // Calculate new positions for selected points only
      const pointsToMirror = this.calculateVerticallyMirroredPositionsForPoints(selectedPoints, center);

      // Update local model first
      this.updateLocalPointPositions(pointsToMirror);

      // Prepare data for SPARQL update
      const updateData = this.preparePositionUpdateData(pointsToMirror);

      // Send update to server
      await this.updatePointPositionsAbsolute(updateData);

      updateStatus(`Mirrored ${selectedPoints.length} points vertically`);
      return true;
    } catch (error) {
      await this.handleTransformationError(error, 'vertical mirroring');
      return false;
    } finally {
      setLoading(false);
    }
  }
}