
export class GluePointQueryBuilder {
  /**
   * Build a query to create a glue point between points
   */
  buildCreateGluePointQuery(
    gluePointIri: string, 
    pointIris: string[],
    cimNamespace: string
  ): string {
    // Create triples for each point-gluePoint relationship
    const pointTriples = pointIris.map(pointIri => 
      `<${pointIri}> cim:DiagramObjectPoint.DiagramObjectGluePoint <${gluePointIri}> .`
    ).join('\n    ');
    
    return `
      PREFIX cim: <${cimNamespace}>
      PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
      
      INSERT DATA {
        <${gluePointIri}> rdf:type cim:DiagramObjectGluePoint .
        ${pointTriples}
      }
    `;
  }

  /**
   * Build a query to remove a glue point
   */
  buildRemoveGluePointQuery(
    gluePointIri: string,
    cimNamespace: string
  ): string {
    return `
      PREFIX cim: <${cimNamespace}>
      
      DELETE {
        <${gluePointIri}> ?p ?o .
        ?point cim:DiagramObjectPoint.DiagramObjectGluePoint <${gluePointIri}> .
      }
      WHERE {
        <${gluePointIri}> ?p ?o .
        OPTIONAL {
          ?point cim:DiagramObjectPoint.DiagramObjectGluePoint <${gluePointIri}> .
        }
      }
    `;
  }

  /**
   * Build a query to add a point to an existing glue point
   */
  buildAddPointToGluePointQuery(
    pointIri: string,
    gluePointIri: string,
    cimNamespace: string
  ): string {
    return `
      PREFIX cim: <${cimNamespace}>
      
      INSERT DATA {
        <${pointIri}> cim:DiagramObjectPoint.DiagramObjectGluePoint <${gluePointIri}> .
      }
    `;
  }

  /**
   * Build a query to remove a point from a glue point
   */
  buildRemovePointFromGluePointQuery(
    pointIri: string,
    gluePointIri: string,
    cimNamespace: string
  ): string {
    return `
      PREFIX cim: <${cimNamespace}>
      
      DELETE {
        <${pointIri}> cim:DiagramObjectPoint.DiagramObjectGluePoint <${gluePointIri}> .
      }
      WHERE {
        <${pointIri}> cim:DiagramObjectPoint.DiagramObjectGluePoint <${gluePointIri}> .
      }
    `;
  }
}