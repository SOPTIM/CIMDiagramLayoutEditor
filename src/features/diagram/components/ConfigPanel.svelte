<script lang="ts">
  import { 
    diagramList,
    selectedDiagram,
    cgmesVersion,
    setCGMESVersion
  } from '../DiagramState';
  import { isLoading, updateStatus } from '../../ui/UIState';
  import { gridEnabled, gridSize } from '../../canvas/CanvasState';
  import { CGMESVersion } from '@/core/models/types';
  import { AppConfig } from '@/core/config/AppConfig';
  import { serviceRegistry } from '@/services/ServiceRegistry';
  import Button from '../../ui/base-components/Button.svelte';
  import Select from '../../ui/base-components/Select.svelte';
  import RadioGroup from '../../ui/base-components/RadioGroup.svelte';
  import Input from '../../ui/base-components/Input.svelte';
  import { showGluePoints } from '../../gluepoints/GluePointState';
  import { interactionState } from '../../interaction/InteractionState';
  
  // Get service
  const diagramService = serviceRegistry.diagramService;
  const objectService = serviceRegistry.objectService;
  
  // Props
  let { 
    onLoadDiagrams, 
    onRenderDiagram, 
    onToggleMap } 
    : {
    onLoadDiagrams: (endpoint: string) => void,
    onRenderDiagram: (diagramIri: string) => void,
    onToggleMap: (show: boolean) => void,    
    } = $props();
  
  // Local state
  let endpoint = $state(AppConfig.defaultEndpoint);
  let showNavigationMap = $state(true);

  let loading = $state(true);
  isLoading.subscribe(value => loading = value);
    
  // Options for CGMES version radio buttons
  const versionOptions = [
    { value: CGMESVersion.V2_4_15, label: '2.4.15' },
    { value: CGMESVersion.V3_0, label: '3.0' }
  ];
    
  // Handle CGMES version change
  function handleVersionChange(version: string) {
    setCGMESVersion(version as CGMESVersion);
  }
  
  // Handle load diagrams button click
  async function handleLoadDiagrams() {
    try {
      await diagramService.loadDiagramProfiles(endpoint);
      onLoadDiagrams(endpoint);
    } catch (error) {
      updateStatus(`Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  // Handle render diagram button click
  async function handleRenderDiagram() {
    try {
      await diagramService.loadDiagramLayout($selectedDiagram);
      onRenderDiagram($selectedDiagram);
    } catch (error) {
      updateStatus(`Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  // Handle diagram selection change
  function handleDiagramChange(diagramIri: string) {
    selectedDiagram.set(diagramIri);
  }
  
  // Handle navigation map toggle
  function toggleNavigationMap() {
    // Just dispatch the current state - don't invert here
    // Let the parent component handle the state
    onToggleMap(showNavigationMap);
  }

  // Handle rotation button click
  async function handleRotate(degrees: number) {
    try {
      // Check if any points are selected
      const selectedPoints = $interactionState.selectedPoints;
      if (selectedPoints.size === 0) {
        updateStatus('No objects selected for rotation');
        return;
      }

      const success = await objectService.rotateSelectedObjects(degrees);
      if (success) {
        updateStatus(`Rotated objects by ${degrees} degrees`);
      }
    } catch (error) {
      updateStatus(`Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
</script>

<div class="config-panel">
  <div class="input-group">
    <Input 
      id="endpoint" 
      label="SPARQL Endpoint URL:" 
      bind:value={endpoint} 
      disabled={loading}
    />
  </div>
  
  <div class="input-group">
    <RadioGroup 
      legend="CGMES Version:" 
      name="cgmes_version" 
      options={versionOptions} 
      value={$cgmesVersion} 
      change={handleVersionChange} 
      disabled={loading}>
    </RadioGroup>
  </div>
  
  <div class="input-group">
    <Select 
      id="diagram-select" 
      label="Select diagram:" 
      options={$diagramList.map(d => ({ value: d.iri, label: d.name }))}
      value={$selectedDiagram}
      required={true}
      change={handleDiagramChange}
      disabled={loading || $diagramList.length === 0}
      placeholder="-- Select a diagram --">
    </Select>
  </div>
  
  <div class="button-group">
    <Button 
      id="load-diagrams" 
      label="Load diagram profiles" 
      on:click={handleLoadDiagrams} 
      disabled={loading}>
    </Button>
    <Button 
      id="render-diagram" 
      label="Render diagram" 
      on:click={handleRenderDiagram} 
      disabled={loading || !$selectedDiagram}>
    </Button>
  </div>
</div>

<div class="grid-controls">
  <div class="checkbox-group">
    <label>
      <input type="checkbox" bind:checked={$gridEnabled} />
      Show Grid
    </label>
  </div>
  <div class="grid-size">
    <label>
      Grid Size:
      <input 
        type="number" 
        bind:value={$gridSize} 
        min="5" 
        max="100" 
        step="5"
      />
    </label>
    <label class="show-map-label">
      <input type="checkbox" bind:checked={showNavigationMap} onchange={toggleNavigationMap} />
      Show Map
    </label>
    <span class="grid-hint">Hold ALT to disable grid snapping</span>
  </div>
  <div class="checkbox-group">
    <label>
      <input type="checkbox" bind:checked={$showGluePoints} />
      Show Glue Connections
    </label>
  </div>

  <div class="rotation-controls">
    <Button
            id="rotate-ccw"
            label="-90°"
            on:click={() => handleRotate(-90)}
            disabled={loading}>
    </Button>
    <Button
            id="rotate-cw"
            label="+90°"
            on:click={() => handleRotate(90)}
            disabled={loading}>
    </Button>
  </div>
</div>



<style>
  .config-panel {
    display: flex;
    flex-wrap: wrap;      
    gap: var(--spacing-lg);
    margin-bottom: var(--spacing-lg);
  }
  
  .input-group {
    flex: 1;
    min-width: 200px;
  }
  
  .button-group {
    display: flex;
    gap: var(--spacing-md);
    align-items: flex-end;
  }

  .grid-controls {
    display: flex;
    flex-wrap: wrap;
    text-wrap: nowrap;
    gap: var(--spacing-md);
    align-items: center;
    border: 1px solid #ddd;
    padding: var(--spacing-sm);
    border-radius: var(--border-radius);
    background-color: #f9f9f9;
  }
  
  .checkbox-group {
    display: flex;
    gap: var(--spacing-lg);
  }
  
  .checkbox-group label {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
    cursor: pointer;
  }
  
  .grid-size {
    display: flex;
    align-items: center;
    margin-left: var(--spacing-xl);
    gap: var(--spacing-lg);
  }

  .grid-size input[type="number"] {
    width: 50px;
    text-align: right;      
    padding: 3px;
    border: 1px solid var(--border-color);
    border-radius: 3px;
  }
  
  .show-map-label {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
    cursor: pointer;
  }

  .grid-hint {
    margin-left: auto;
    font-size: 0.8rem;
    font-style: italic;
    color: #666;
    white-space: nowrap;
  }

  .rotation-controls {
    display: flex;
    gap: var(--spacing-md);
    margin-left: auto;
    align-items: center;
  }

  .rotation-controls button {
    min-width: 60px;
  }
</style>