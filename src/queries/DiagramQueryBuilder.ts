export class DiagramQueryBuilder {
    /**
     * Build a query to get all diagrams
     */
    buildDiagramsQuery(cimNamespace: string): string {
      return `
        PREFIX cim: <${cimNamespace}>
        PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
        
        SELECT ?diagram ?name
        WHERE {
           ?diagram rdf:type cim:Diagram .
            OPTIONAL {
                ?diagram cim:IdentifiedObject.name ?name .
            }
        }
        ORDER BY ?name
      `;
    }
    
    /**
     * Build a query to get diagram layout data
     */
    buildDiagramLayoutQuery(diagramIri: string, cimNamespace: string): string {
      return `
        PREFIX cim: <${cimNamespace}>
        PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
        PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
        
        SELECT ?diagramObject ?point ?xPosition ?yPosition ?sequenceNumber ?drawingOrder 
               ?isPolygon ?isTextDiagramObject ?textContent ?gluePoint
        WHERE { 
        
        ?diagramObject cim:DiagramObject.Diagram <${diagramIri}> . 
        
        ?diagramObject rdf:type ?type. 
        BIND(?type = cim:TextDiagramObject AS ?isTextDiagramObject) .
        FILTER(?type IN (cim:DiagramObject, cim:TextDiagramObject)) .
    
        OPTIONAL {
            ?diagramObject cim:DiagramObject.drawingOrder ?drawOrd .
        }
        BIND(IF(bound(?drawOrd), xsd:integer(?drawOrd), 0) AS ?drawingOrder) .   
    
        ?point cim:DiagramObjectPoint.DiagramObject ?diagramObject;
               cim:DiagramObjectPoint.xPosition ?x;
               cim:DiagramObjectPoint.yPosition ?y .
        BIND(xsd:float(?x) AS ?xPosition) .
        BIND(xsd:float(?y) AS ?yPosition) .
    
        OPTIONAL {
            ?point cim:DiagramObjectPoint.sequenceNumber ?seqNum .
        }
        BIND(IF(bound(?seqNum), xsd:integer(?seqNum), 0) AS ?sequenceNumber) .   
    
        OPTIONAL {
            ?diagramObject cim:DiagramObject.isPolygon ?isPoly .
        }
        BIND(IF(bound(?isPoly), xsd:boolean(?isPoly), false) AS ?isPolygon) .   
        
        OPTIONAL {
            ?diagramObject cim:TextDiagramObject.text ?text .
        }
        BIND(IF(bound(?text), ?text, "") AS ?textContent) .
        
        # Get glue point references
        OPTIONAL {
            ?point cim:DiagramObjectPoint.DiagramObjectGluePoint ?gluePoint .
        }
        }
        ORDER BY ?drawingOrder ?sequenceNumber
      `;
    }
  }