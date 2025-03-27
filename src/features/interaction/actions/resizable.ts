/**
 * Svelte action to make elements resize with window
 *
 * @param _node - Element to make resizable
 * @param callback - Optional callback to execute on resize
 */
export function resizable(_node: HTMLElement, callback?: () => void) {
    // Handler for window resize
    function handleResize() {
      if (callback) callback();
    }
    
    // Initialize
    handleResize();
    
    // Attach event listener
    window.addEventListener('resize', handleResize);
    
    return {
      destroy() {
        // Clean up
        window.removeEventListener('resize', handleResize);
      }
    };
  }