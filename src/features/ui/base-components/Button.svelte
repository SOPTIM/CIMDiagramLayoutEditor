<script lang="ts">
    export let id: string | undefined = undefined;
    export let label: string;
    export let type: 'button' | 'submit' | 'reset' = 'button';
    export let disabled: boolean = false;
    export let primary: boolean = true;
    export let tooltip: string | undefined = undefined;
</script>
  
  <button 
    {id} 
    {type}
    {disabled} 
    class:primary
    title={tooltip}
    on:click
  >
    {label}
  </button>
  
  <style>
    button {
      padding: var(--spacing-sm) var(--spacing-lg);
      border-radius: var(--border-radius);
      font-weight: bold;
      cursor: pointer;
      transition: background-color var(--transition-speed);
      border: none;
      min-width: 120px;
    }
    
    button.primary {
      background-color: var(--primary-color);
      color: white;
    }
    
    button.primary:hover:not([disabled]) {
      background-color: var(--primary-hover-color);
    }
    
    button:not(.primary) {
      background-color: var(--secondary-color);
      color: white;
    }
    
    button:not(.primary):hover:not([disabled]) {
      filter: brightness(1.1);
    }
    
    button[disabled] {
      background-color: var(--disabled-color);
      cursor: not-allowed;
    }
  </style>