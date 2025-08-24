import { describe, it, expect, beforeEach } from 'vitest';
import { useCanvasStore } from './store';

describe('Guide lines move history optimization', () => {
  beforeEach(() => {
    useCanvasStore.setState({
      guides: [],
      activeGuideId: null,
      historyPast: [],
      historyFuture: [],
    });
  });

  it('moveGuideTemporary should not create history entries', () => {
    const { addGuide, moveGuideTemporary } = useCanvasStore.getState();
    
    // Add a guide
    const id = addGuide('x', 100);
    const initialHistoryLength = useCanvasStore.getState().historyPast.length;
    
    // Move it temporarily multiple times
    moveGuideTemporary(id, 150);
    moveGuideTemporary(id, 200);
    moveGuideTemporary(id, 250);
    
    // History should not have grown
    expect(useCanvasStore.getState().historyPast.length).toBe(initialHistoryLength);
    
    // But guide position should be updated
    const guide = useCanvasStore.getState().guides.find(g => g.id === id);
    expect(guide?.value).toBe(250);
  });

  it('moveGuide should create single history entry after temporary moves', () => {
    const { addGuide, moveGuideTemporary, moveGuide } = useCanvasStore.getState();
    
    // Add a guide
    const id = addGuide('x', 100);
    const initialHistoryLength = useCanvasStore.getState().historyPast.length;
    
    // Move it temporarily (no history)
    moveGuideTemporary(id, 150);
    moveGuideTemporary(id, 200);
    
    // Now commit the move to history
    moveGuide(id, 200);
    
    // Should have exactly one more history entry
    expect(useCanvasStore.getState().historyPast.length).toBe(initialHistoryLength + 1);
    
    // Final position should be correct
    const guide = useCanvasStore.getState().guides.find(g => g.id === id);
    expect(guide?.value).toBe(200);
  });

  it('undo after move should revert to original position, not intermediate steps', () => {
    const { addGuide, moveGuideTemporary, moveGuideCommit, undo } = useCanvasStore.getState();
    
    // Add a guide at position 100
    const id = addGuide('x', 100);
    
    // Simulate drag: temporary moves + final commit
    moveGuideTemporary(id, 120);
    moveGuideTemporary(id, 140);
    moveGuideTemporary(id, 160);
    moveGuideCommit(id, 100, 160); // Commit final position with original and final values
    
    // Verify final position
    let guide = useCanvasStore.getState().guides.find(g => g.id === id);
    expect(guide?.value).toBe(160);
    
    // Undo should revert to original position (100), not any intermediate step
    undo();
    
    guide = useCanvasStore.getState().guides.find(g => g.id === id);
    expect(guide?.value).toBe(100);
  });

  it('multiple separate moves should create separate history entries', () => {
    const { addGuide, moveGuide } = useCanvasStore.getState();
    
    // Add a guide
    const id = addGuide('x', 100);
    const initialHistoryLength = useCanvasStore.getState().historyPast.length;
    
    // Make two separate committed moves
    moveGuide(id, 150);
    moveGuide(id, 200);
    
    // Should have two more history entries
    expect(useCanvasStore.getState().historyPast.length).toBe(initialHistoryLength + 2);
  });
});
