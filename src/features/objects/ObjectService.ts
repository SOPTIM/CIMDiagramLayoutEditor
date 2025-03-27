import { get } from 'svelte/store';
import { SparqlService } from '@/services/SparqlService';
import { ObjectQueryBuilder } from '@/queries/ObjectQueryBuilder';
import type { Point2D, Bounds } from '@/core/models/types';
import type { DiagramObjectModel } from '@/core/models/DiagramObjectModel';

// Import state from feature modules
import { diagramData, cimNamespace, selectedDiagram } from '../diagram/DiagramState';
import { setLoading, updateStatus } from '../ui/UIState';
import { interactionState, clearSelection } from '../interaction/InteractionState';
import type { DiagramService } from '../diagram/DiagramService';
import type { PointQueryBuilder } from '@/queries/PointQueryBuilder';
import { v4 as uuidv4 } from 'uuid';

export class ObjectService {
  constructor(
    private sparqlService: SparqlService,
    private diagramService: DiagramService,
    private objectQueryBuilder: ObjectQueryBuilder,
    private pointQueryBuilder: PointQueryBuilder
  ) {}

  /**
   * Toggle the isPolygon property of a diagram object
   */
  async togglePolygonProperty(
    object: DiagramObjectModel,
    isPolygon: boolean
  ): Promise<void> {
    if (!object) return;
    
    const currentDiagram = get(diagramData);
    if (!currentDiagram) return;
    
    // Check if we have enough points to form a polygon (minimum 3)
    if (isPolygon && object.points.length < 3) {
      updateStatus('Cannot create polygon: at least 3 points are required');
      return;
    }
    
    try {
      setLoading(true);
      updateStatus(`${isPolygon ? 'Creating' : 'Removing'} polygon...`);
      
      // Update object property locally
      object.isPolygon = isPolygon;
      
      // Update the diagram in the UI
      diagramData.set(currentDiagram);
      
      // Get the current namespace
      const namespace = get(cimNamespace);
      
      // Persist changes to the database
      const query = this.objectQueryBuilder.buildUpdatePolygonPropertyQuery(
        object.iri,
        isPolygon,
        namespace
      );
      
      await this.sparqlService.executeUpdate(query);
      
      updateStatus(`Polygon ${isPolygon ? 'created' : 'removed'} successfully`);
      
    } catch (error) {
      console.error('Error updating polygon property:', error);
      updateStatus(`Error: ${error instanceof Error ? error.message : String(error)}`);
      
      // If there was an error, revert the change in the UI
      if (object) {
        object.isPolygon = !isPolygon; // Revert to previous state
        
        // Update the diagram
        if (currentDiagram) {
          diagramData.set(currentDiagram);
        }
      }
    } finally {
      setLoading(false);
    }
  }

  /**
   * Copy selected diagram objects to clipboard
   */
  copySelectedDiagramObjects(): void {
    const currentState = get(interactionState);
    const currentDiagram = get(diagramData);
    
    if (!currentDiagram || currentState.selectedPoints.size === 0) {
      updateStatus('Nothing selected to copy');
      return;
    }
    
    // Find all parent DiagramObjects of selected points
    const objectIris = new Set<string>();
    
    currentState.selectedPoints.forEach(pointIri => {
      const point = currentDiagram.points.find(p => p.iri === pointIri);
      if (point && point.parentObject) {
        objectIris.add(point.parentObject.iri);
      }
    });
    
    if (objectIris.size === 0) {
      updateStatus('No objects to copy');
      return;
    }
    
    // Write object IRIs to clipboard
    const clipboardText = JSON.stringify({
       type: 'DiagramObject', 
       IRIs: Array.from(objectIris) 
      });
    navigator.clipboard.writeText(clipboardText)
      .then(() => {
        // Select all points of the copied objects
        this.selectAllPointsOfObjects(objectIris);
        updateStatus(`Copied ${objectIris.size} diagram object(s)`);
      })
      .catch(err => {
        console.error('Error writing to clipboard:', err);
        updateStatus('Error copying to clipboard');
      });
  }

  /**
   * Select all points that belong to the given DiagramObjects
   */
  private selectAllPointsOfObjects(objectIris: Set<string>): void {
    const currentDiagram = get(diagramData);
    if (!currentDiagram) return;
    
    // Create a new set of selected points
    const newSelectedPoints = new Set<string>();
    
    // Find all points that belong to the objects
    currentDiagram.points.forEach(point => {
      if (point.parentObject && objectIris.has(point.parentObject.iri)) {
        newSelectedPoints.add(point.iri);
      }
    });
    
    // Update selection state
    interactionState.update(state => ({
      ...state,
      selectedPoints: newSelectedPoints
    }));
  }

  /**
   * Calculate bounds of selected DiagramObjects
   */
  private getObjectsBounds(objectIris: Set<string>): Bounds {
    const currentDiagram = get(diagramData);
    if (!currentDiagram || objectIris.size === 0) {
      return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    }
    
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    
    currentDiagram.points.forEach(point => {
      if (point.parentObject && objectIris.has(point.parentObject.iri)) {
        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);
      }
    });
    
    return { minX, minY, maxX, maxY };
  }

  /**
   * Calculate center point of bounds
   */
  private getBoundsCenter(bounds: Bounds): Point2D {
    return {
      x: (bounds.minX + bounds.maxX) / 2,
      y: (bounds.minY + bounds.maxY) / 2
    };
  }

  /**
   * Paste copied DiagramObjects at the specified position
   */
  async pasteDiagramObjects(pastePosition: Point2D): Promise<void> {
    // Read object IRIs from clipboard
    let clipboardText: string;
    try {
      clipboardText = await navigator.clipboard.readText();
    } catch (err) {
      console.error('Error reading from clipboard:', err);
      updateStatus('Error reading from clipboard');
      return;
    }

    let result;
    try {
      result = JSON.parse(clipboardText);
    } catch (error) {
      updateStatus('No valid diagram objects in clipboard');
      return;  
    }
    
    if(result == null || result.type !== 'DiagramObject') {
      updateStatus('No valid diagram objects in clipboard');
      return;
    }
    
    // Parse object IRIs
    const objectIris = new Set<string>(result.IRIs);
    
    if (objectIris.size === 0) {
      updateStatus('No valid diagram objects in clipboard');
      return;
    }
    
    // Start loading
    setLoading(true);
    updateStatus(`Pasting ${objectIris.size} diagram objects...`);
    
    try {
      // Calculate bounds of selected objects
      const bounds = this.getObjectsBounds(objectIris);
      
      // Calculate center of bounds
      const boundsCenter = this.getBoundsCenter(bounds);
      
      // Calculate offset from bounds center to paste position
      const offsetX = pastePosition.x - boundsCenter.x;
      const offsetY = pastePosition.y - boundsCenter.y;
      
      // Get the current namespace and diagram
      const namespace = get(cimNamespace);
      const diagramIri = get(selectedDiagram);
      
      if (!diagramIri) {
        throw new Error('No diagram selected');
      }
      
      // Call the SparqlService to clone objects
      // (Note: This assumes SparqlService has a cloneObjectsWithOffset method)
      const newObjPointIris = await this.cloneObjectsWithOffset(
        diagramIri,
        Array.from(objectIris),
        offsetX,
        offsetY,
        namespace
      );
      
      // Reload the diagram to include the new objects
      // In a real implementation, you might want to incrementally update the diagram
      // model instead of reloading everything
      await this.diagramService.reloadDiagram();
      
      // Select the newly created points
      if (newObjPointIris && newObjPointIris.pointIris) {
        interactionState.update(state => ({
          ...state,
          selectedPoints: new Set(newObjPointIris.pointIris)
        }));
      }
      
      updateStatus(`Pasted ${objectIris.size} diagram objects`);
    } catch (error) {
      console.error('Error pasting diagram objects:', error);
      updateStatus(`Error: ${error instanceof Error ? error.message : String(error)}`);

      await this.diagramService.reloadDiagram();
    } finally {
      setLoading(false);
    }
  }

  /**
   * Delete selected DiagramObjects
   */
  async deleteSelectedDiagramObjects(): Promise<void> {
    const currentState = get(interactionState);
    const currentDiagram = get(diagramData);
    
    if (!currentDiagram || currentState.selectedPoints.size === 0) {
      updateStatus('Nothing selected to delete');
      return;
    }
    
    // Find all parent DiagramObjects of selected points
    const objectIris = new Set<string>();
    
    currentState.selectedPoints.forEach(pointIri => {
      const point = currentDiagram.points.find(p => p.iri === pointIri);
      if (point && point.parentObject) {
        objectIris.add(point.parentObject.iri);
      }
    });
    
    if (objectIris.size === 0) {
      updateStatus('No objects to delete');
      return;
    }
    
    // Select all points of these objects
    this.selectAllPointsOfObjects(objectIris);
  
    // Wait for rendering of selected objects
    await new Promise(r => setTimeout(r, 200));
    
    // Show confirmation dialog
    const confirmDelete = window.confirm(`Are you sure you want to delete ${objectIris.size} diagram object(s)?`);
    
    if (!confirmDelete) {
      updateStatus('Delete operation cancelled');
      return;
    }
    
    // Check for glue point connections to other objects
    const pointsToDelete = new Set<string>();
    currentDiagram.points.forEach(point => {
      if (point.parentObject && objectIris.has(point.parentObject.iri)) {
        pointsToDelete.add(point.iri);
      }
    });
    
    const hasExternalGlueConnections = Array.from(pointsToDelete).some(pointIri => {
      const gluedPoints = currentDiagram.getGluedPoints(pointIri);
      return gluedPoints.some(gluedPointIri => !pointsToDelete.has(gluedPointIri));
    });
    
    if (hasExternalGlueConnections) {
      const confirmBreakConnections = window.confirm(
          'Some of these objects have points glued to other objects. ' +
          'Deleting these objects will break these glue connections. Continue?'
      );
      
      if (!confirmBreakConnections) {
        updateStatus('Delete operation cancelled');
        return;
      }
    }
    
    // Start loading
    setLoading(true);
    updateStatus(`Deleting ${objectIris.size} diagram objects...`);
    
    try {      
      // Get the current namespace
      const namespace = get(cimNamespace);
      
      // Build delete query
      const deleteQuery = this.objectQueryBuilder.buildDeleteDiagramObjectsQuery(
        Array.from(objectIris),
        namespace
      );
      
      // Execute delete query
      await this.sparqlService.executeUpdate(deleteQuery);
      
      await this.diagramService.reloadDiagram();
      
      updateStatus(`Deleted ${objectIris.size} diagram objects`);
      
      // Clear selection since the points were deleted
      clearSelection();
    } catch (error) {
      console.error('Error deleting diagram objects:', error);
      updateStatus(`Error: ${error instanceof Error ? error.message : String(error)}`);
  
      await this.diagramService.reloadDiagram();
    } finally {
      setLoading(false);
    }
  }

  /**
   * Rotate selected objects around the center of selection
   */
  async rotateSelectedObjects(degrees: number): Promise<boolean> {
    const { objectIris, validationError } = this.validateSelectedObjectsForRotation();
    
    if (validationError) {
      updateStatus(validationError);
      return false;
    }
    
    // Ensure all points of these objects are selected
    this.selectAllPointsOfObjects(objectIris);
    
    // Calculate rotation parameters
    const center = this.calculateRotationCenter(objectIris);
    const { sin, cos } = this.getRotationTrigValues(degrees);
    
    // Start operation
    setLoading(true);
    updateStatus(`Rotating ${objectIris.size} diagram objects...`);
    
    try {
      // Calculate new positions and update local model
      const pointsToRotate = this.calculateRotatedPositions(objectIris, center, sin, cos);
      
      // Update local model first
      this.updateLocalPointPositions(pointsToRotate);
      
      // Prepare data for SPARQL update
      const updateData = this.preparePositionUpdateData(pointsToRotate);
      
      // Send update to server
      await this.updatePointPositionsInSparql(updateData);
      
      updateStatus(`Rotated ${objectIris.size} diagram objects by ${degrees} degrees`);
      return true;
    } catch (error) {
      await this.handleRotationError(error);
      return false; 
    } finally {
      setLoading(false);
    }
  }
  
  validateSelectedObjectsForRotation() {
    const currentState = get(interactionState);
    const currentDiagram = get(diagramData);
    
    if (!currentDiagram || currentState.selectedPoints.size === 0) {
      return { objectIris: new Set<string>(), validationError: 'Nothing selected to rotate' };
    }
    
    // Find parent objects
    const objectIris = new Set<string>();
    currentState.selectedPoints.forEach(pointIri => {
      const point = currentDiagram.points.find(p => p.iri === pointIri);
      if (point?.parentObject) {
        objectIris.add(point.parentObject.iri);
      }
    });
    
    if (objectIris.size === 0) {
      return { objectIris, validationError: 'No objects to rotate' };
    }
    
    return { objectIris, validationError: null };
  }
  
  getRotationTrigValues(degrees: number) {
    const radians = (degrees * Math.PI) / 180;
    return {
      sin: Math.sin(radians),
      cos: Math.cos(radians)
    };
  }
  
  calculateRotationCenter(objectIris: Set<string>) {
    const bounds = this.getObjectsBounds(objectIris);
    return this.getBoundsCenter(bounds);
  }
  
  calculateRotatedPositions(objectIris: Set<string>, center: Point2D, sin: number, cos: number) 
    : { point: any; newX: number; newY: number }[] {
    const currentDiagram = get(diagramData);
    if (!currentDiagram) {
      console.error('No diagram data found');
      return [];
    }

    const pointsToRotate: { point: any; newX: number; newY: number }[] = [];
    
    currentDiagram.points.forEach(point => {
      if (point.parentObject && objectIris.has(point.parentObject.iri)) {
        // Apply rotation matrix
        const dx = point.x - center.x;
        const dy = point.y - center.y;
        const newX = center.x + (dx * cos - dy * sin);
        const newY = center.y + (dx * sin + dy * cos);
        
        pointsToRotate.push({ point, newX, newY });
      }
    });
    
    return pointsToRotate;
  }
  
  updateLocalPointPositions(pointsToRotate: { point: any; newX: number; newY: number }[]) {
    pointsToRotate.forEach(({ point, newX, newY }) => {
      point.x = newX;
      point.y = newY;
    });
    
    // Update the diagram
    diagramData.set(get(diagramData));
  }
  
  preparePositionUpdateData(pointsToRotate: { point: any; newX: number; newY: number }[]) {
    return {
      points: pointsToRotate.map(({ point }) => point.iri),
      newPositions: pointsToRotate.map(({ newX, newY }) => ({ x: newX, y: newY }))
    };
  }
  
  async updatePointPositionsInSparql(updateData: { points: string[]; newPositions: Array<{ x: number; y: number }> }) {
    const query = this.pointQueryBuilder.buildUpdateDiagramPointPositionsQuery(
      updateData.points, 
      updateData.newPositions, 
      get(cimNamespace)
    );
    
    await this.sparqlService.executeUpdate(query);
  }
  
  async handleRotationError(error: any) {
    console.error('Error rotating objects:', error);
    updateStatus(`Error: ${error instanceof Error ? error.message : String(error)}`);
    
    await this.diagramService.reloadDiagram();
  }

  /**
   * Clone objects with their points and apply an offset to the point positions
   * 
   * @param diagramIri - Diagram IRI
   * @param objectIris - IRIs of objects to clone
   * @param offsetX - X offset to apply to point positions
   * @param offsetY - Y offset to apply to point positions
   * @param cimNamespace - CIM namespace
   * @returns New object and point IRIs
   */
  async cloneObjectsWithOffset(
    diagramIri: string,
    objectIris: string[],
    offsetX: number,
    offsetY: number,
    cimNamespace: string
  ): Promise<{ objectIris: string[], pointIris: string[] }> {
    try {
      // Step 1: Create mappings for new IRIs
      const objectMapping = new Map<string, string>();
      const gluePointMapping = new Map<string, string>();
      const pointMapping = new Map<string, string>();
      const newObjectIris: string[] = [];
      const newPointIris: string[] = [];
      
      // Create new IRIs for each DiagramObject
      objectIris.forEach(iri => {
        const newIri = `urn:uuid:${uuidv4()}`;
        objectMapping.set(iri, newIri);
        newObjectIris.push(newIri);
      });
      
      // Step 2: Clone all DiagramObjects (including TextDiagramObjects)
      let objectCloneQuery = `
        PREFIX cim: <${cimNamespace}>
        PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
        
        INSERT {
          ?newObj ?p ?o .
          ?newObj cim:DiagramObject.Diagram <${diagramIri}> .
        }
        WHERE {
          VALUES (?obj ?newObj) {
            ${Array.from(objectMapping.entries()).map(([oldIri, newIri]) => `(<${oldIri}> <${newIri}>)`).join('\n          ')}
          }
          ?obj ?p ?o .
          FILTER(?p != cim:DiagramObject.Diagram)
        }
      `;
      
      await this.sparqlService.executeUpdate(objectCloneQuery);
      
      // Step 3: Get all points and create new point IRIs
      const allPointsQuery = `
        PREFIX cim: <${cimNamespace}>
        
        SELECT ?point ?obj
        WHERE {
          VALUES ?obj {
            ${objectIris.map(iri => `<${iri}>`).join('\n          ')}
          }
          ?point cim:DiagramObjectPoint.DiagramObject ?obj .
        }
      `;
      
      const allPointsResult = await this.sparqlService.executeQuery(allPointsQuery);
      
      // Create mappings for all points
      if (allPointsResult.results && allPointsResult.results.bindings && allPointsResult.results.bindings.length > 0) {
        allPointsResult.results.bindings.forEach(binding => {
          if (binding.point) {
            const oldPointIri = binding.point.value;
            const newPointIri = `urn:uuid:${uuidv4()}`;
            pointMapping.set(oldPointIri, newPointIri);
            newPointIris.push(newPointIri);
          }
        });
      } else {
        // No points to clone
        return { objectIris: newObjectIris, pointIris: [] };
      }
      
      // Step 4: Find all DiagramGluePoints linked to the DiagramObjects via DiagramObjectPoints
      const gluePointsQuery = `
        PREFIX cim: <${cimNamespace}>
        
        SELECT DISTINCT ?point ?gluePoint
        WHERE {
          VALUES ?obj {
            ${objectIris.map(iri => `<${iri}>`).join('\n          ')}
          }
          ?point cim:DiagramObjectPoint.DiagramObject ?obj .
          ?point cim:DiagramObjectPoint.DiagramObjectGluePoint ?gluePoint .
        }
      `;
      
      const gluePointsResult = await this.sparqlService.executeQuery(gluePointsQuery);
      
      // Create mappings for glue points
      if (gluePointsResult.results && gluePointsResult.results.bindings) {
        gluePointsResult.results.bindings.forEach(binding => {
          if (binding.gluePoint) {
            const oldGlueIri = binding.gluePoint.value;
            if (!gluePointMapping.has(oldGlueIri)) {
              const newGlueIri = `urn:uuid:${uuidv4()}`;
              gluePointMapping.set(oldGlueIri, newGlueIri);
            }
          }
        });
      }
      
      // Step 5: Clone the DiagramGluePoints if any were found
      if (gluePointMapping.size > 0) {
        const gluePointCloneQuery = `
          PREFIX cim: <${cimNamespace}>
          PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
          
          INSERT {
            ?newGlue ?p ?o .
          }
          WHERE {
            VALUES (?glue ?newGlue) {
              ${Array.from(gluePointMapping.entries()).map(([oldIri, newIri]) => `(<${oldIri}> <${newIri}>)`).join('\n            ')}
            }
            ?glue ?p ?o .
          }
        `;
        
        await this.sparqlService.executeUpdate(gluePointCloneQuery);
      }
      
      // Step 6: Clone all points (basic properties only, no references)
      const pointCloneQuery = `
        PREFIX cim: <${cimNamespace}>
        PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
        
        INSERT {
          ?newPoint ?p ?o .
        }
        WHERE {
          VALUES (?point ?newPoint) {
            ${Array.from(pointMapping.entries()).map(([oldIri, newIri]) => `(<${oldIri}> <${newIri}>)`).join('\n          ')}
          }
          ?point ?p ?o .
          FILTER(?p != cim:DiagramObjectPoint.DiagramObject)
          FILTER(?p != cim:DiagramObjectPoint.DiagramObjectGluePoint)
        }
      `;
      
      await this.sparqlService.executeUpdate(pointCloneQuery);
      
      // Step 7: Update DiagramObject references for points
      const updateObjectRefsQuery = `
        PREFIX cim: <${cimNamespace}>
        
        INSERT {
          ?newPoint cim:DiagramObjectPoint.DiagramObject ?newObj .
        }
        WHERE {
          VALUES (?point ?newPoint) {
            ${Array.from(pointMapping.entries()).map(([oldIri, newIri]) => `(<${oldIri}> <${newIri}>)`).join('\n          ')}
          }
          ?point cim:DiagramObjectPoint.DiagramObject ?obj .
          VALUES (?obj ?newObj) {
            ${Array.from(objectMapping.entries()).map(([oldIri, newIri]) => `(<${oldIri}> <${newIri}>)`).join('\n          ')}
          }
        }
      `;
      
      await this.sparqlService.executeUpdate(updateObjectRefsQuery);
      
      // Step 8: Update GluePoint references if needed
      if (gluePointMapping.size > 0) {
        const updateGlueRefsQuery = `
          PREFIX cim: <${cimNamespace}>
          
          INSERT {
            ?newPoint cim:DiagramObjectPoint.DiagramObjectGluePoint ?newGlue .
          }
          WHERE {
            VALUES (?point ?newPoint) {
              ${Array.from(pointMapping.entries()).map(([oldIri, newIri]) => `(<${oldIri}> <${newIri}>)`).join('\n            ')}
            }
            ?point cim:DiagramObjectPoint.DiagramObjectGluePoint ?glue .
            VALUES (?glue ?newGlue) {
              ${Array.from(gluePointMapping.entries()).map(([oldIri, newIri]) => `(<${oldIri}> <${newIri}>)`).join('\n            ')}
            }
          }
        `;
        
        await this.sparqlService.executeUpdate(updateGlueRefsQuery);
      }
      
      // Step 9: Update point coordinates with offset
      const updateCoordinatesQuery = `
        PREFIX cim: <${cimNamespace}>
        PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
        
        DELETE {
          ?newPoint cim:DiagramObjectPoint.xPosition ?oldX .
          ?newPoint cim:DiagramObjectPoint.yPosition ?oldY .
        }
        INSERT {
          ?newPoint cim:DiagramObjectPoint.xPosition ?newX .
          ?newPoint cim:DiagramObjectPoint.yPosition ?newY .
        }
        WHERE {
          VALUES (?point ?newPoint) {
            ${Array.from(pointMapping.entries()).map(([oldIri, newIri]) => `(<${oldIri}> <${newIri}>)`).join('\n          ')}
          }
          ?point cim:DiagramObjectPoint.xPosition ?x .
          ?point cim:DiagramObjectPoint.yPosition ?y .
          
          ?newPoint cim:DiagramObjectPoint.xPosition ?oldX .
          ?newPoint cim:DiagramObjectPoint.yPosition ?oldY .
          
          BIND(xsd:float(?x) + ${offsetX} AS ?newX)
          BIND(xsd:float(?y) + ${offsetY} AS ?newY)
        }
      `;
      
      await this.sparqlService.executeUpdate(updateCoordinatesQuery);
      
      return {
        objectIris: newObjectIris,
        pointIris: newPointIris
      };
    } catch (error) {
      console.error('Error in cloneObjectsWithOffset:', error);
      throw error;
    }
  } 
}