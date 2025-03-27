<script lang="ts">
    
    // Component properties
    import type {Point2D} from "@/core/models/types";

    export let status: string = 'Ready';
    export let coordinates: Point2D = { x: 0, y: 0 };
  </script>
  
  <div class="status-bar">
    <div class="status">{status}</div>
    <div class="coordinates">X: {coordinates.x}, Y: {coordinates.y}</div>
  </div>
  
  <style>
    .status-bar {
      padding: var(--spacing-sm);
      background-color: #f5f5f5;
      border-top: 1px solid #ddd;
      display: flex;
      justify-content: space-between;
      font-size: 0.9rem;
    }
    
    .status, .coordinates {
      padding: 0 var(--spacing-sm);
    }
  </style>