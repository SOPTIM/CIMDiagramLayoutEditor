export class ObjectQueryBuilder {
    /**
     * Build a query to update the isPolygon property of a diagram object
     */
    buildUpdatePolygonPropertyQuery(
      objectIri: string,
      isPolygon: boolean,
      cimNamespace: string
    ): string {
      return `
        PREFIX cim: <${cimNamespace}>
        PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
        PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
        
        DELETE {
          <${objectIri}> cim:DiagramObject.isPolygon ?oldValue .
        }
        INSERT {
          <${objectIri}> cim:DiagramObject.isPolygon "${isPolygon}"^^xsd:boolean .
        }
        WHERE {
          OPTIONAL { <${objectIri}> cim:DiagramObject.isPolygon ?oldValue . }
        }
      `;
    }
    
    /**
     * Build a query to delete diagram objects and their points
     */
    buildDeleteDiagramObjectsQuery(
      objectIris: string[],
      cimNamespace: string
    ): string {
      return `
        PREFIX cim: <${cimNamespace}>
        
        DELETE {
          ?obj ?p ?o .
          ?point ?pp ?po .
          ?gluePoint ?gp ?go .
        }
        WHERE {
          VALUES ?obj {
            ${objectIris.map(iri => `<${iri}>`).join('\n          ')}
          }
          ?obj ?p ?o .
          
          OPTIONAL {
            ?point cim:DiagramObjectPoint.DiagramObject ?obj .
            ?point ?pp ?po .
            
            OPTIONAL {
              ?point cim:DiagramObjectPoint.DiagramObjectGluePoint ?gluePoint .
              ?gluePoint ?gp ?go .
            }
          }
        }
      `;
    }
  }