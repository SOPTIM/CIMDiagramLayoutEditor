<script lang="ts">
  import type { ViewTransform } from '@/core/models/types';
  import { worldToScreen } from '@/utils/geometry';
  import { diagramData } from '../../diagram/DiagramState';
  import { showGluePoints, getVisibleGlueConnections } from '../GluePointState';
  
  // Props using Runes syntax
  let { viewTransform } = $props<{
    viewTransform: ViewTransform
  }>();
  
  // Local state
  let connections = $state<Array<{
    point1Screen: { x: number, y: number },
    point2Screen: { x: number, y: number },
    gluePointIri: string
  }>>([]);
  
  // Watch for changes in diagram data, viewTransform, or showGluePoints setting
  $effect(() => {
    if (!$diagramData || !$showGluePoints) {
      connections = [];
      return;
    }
    
    // Get all glue point connections
    const glueConnections = getVisibleGlueConnections();
    
    // Convert to screen coordinates
    connections = glueConnections
      .map(conn => {
        const point1 = $diagramData.points.find(p => p.iri === conn.point1);
        const point2 = $diagramData.points.find(p => p.iri === conn.point2);
        
        if (!point1 || !point2) return null;
        
        return {
          point1Screen: worldToScreen(point1.x, point1.y, viewTransform),
          point2Screen: worldToScreen(point2.x, point2.y, viewTransform),
          gluePointIri: conn.gluePointIri
        };
      })
      .filter(conn => conn !== null) as Array<{
        point1Screen: { x: number, y: number },
        point2Screen: { x: number, y: number },
        gluePointIri: string
      }>;
  });
</script>

{#if $showGluePoints}
  <div class="glue-connections-container">
    <!-- Render each connection as an SVG line -->
    {#each connections as conn}
      <svg class="glue-connection-line" 
           style="position: absolute; left: 0; top: 0; width: 100%; height: 100%; pointer-events: none; z-index: 5;">
        <line 
          x1={conn.point1Screen.x} 
          y1={conn.point1Screen.y} 
          x2={conn.point2Screen.x} 
          y2={conn.point2Screen.y}
          class="glue-line" />
      </svg>
    {/each}
  </div>
{/if}

<style>
  .glue-connections-container {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 5;
  }
  
  .glue-line {
    stroke: #007bff;
    stroke-width: 1.5;
    stroke-dasharray: 4, 4;
    stroke-linecap: round;
  }
</style>