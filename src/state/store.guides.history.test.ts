import { describe, it, expect, beforeEach } from 'vitest';
import { useCanvasStore } from './store';

describe('Guide lines history integration', () => {
  beforeEach(() => {
    // Reset store state
    useCanvasStore.setState({
      guides: [],
      activeGuideId: null,
      historyPast: [],
      historyFuture: [],
    });
  });

  it('should save guide addition to history and support undo/redo', () => {
    // Add a guide
    const guideId = useCanvasStore.getState().addGuide('x', 100);

    // Check guide was added
    let state = useCanvasStore.getState();
    expect(state.guides).toHaveLength(1);
    expect(state.guides[0]).toEqual({ id: guideId, axis: 'x', value: 100 });

    // Check history was recorded
    expect(state.historyPast).toHaveLength(1);
    expect(state.historyPast[0].guideChanges).toHaveLength(1);
    expect(state.historyPast[0].guideChanges![0].kind).toBe('add');

    // Undo
    useCanvasStore.getState().undo();

    // Check guide was removed
    state = useCanvasStore.getState();
    expect(state.guides).toHaveLength(0);
    expect(state.historyPast).toHaveLength(0);
    expect(state.historyFuture).toHaveLength(1);

    // Redo
    useCanvasStore.getState().redo();

    // Check guide was restored
    state = useCanvasStore.getState();
    expect(state.guides).toHaveLength(1);
    expect(state.guides[0]).toEqual({ id: guideId, axis: 'x', value: 100 });
    expect(state.historyPast).toHaveLength(1);
    expect(state.historyFuture).toHaveLength(0);
  });

  it('should save guide removal to history and support undo/redo', () => {
    // Add a guide first
    const guideId = useCanvasStore.getState().addGuide('y', 200);

    // Clear history to focus on removal
    useCanvasStore.setState({ historyPast: [], historyFuture: [] });

    // Remove the guide
    useCanvasStore.getState().removeGuide(guideId);

    // Check guide was removed
    let state = useCanvasStore.getState();
    expect(state.guides).toHaveLength(0);
    expect(state.activeGuideId).toBe(null);

    // Check history was recorded
    expect(state.historyPast).toHaveLength(1);
    expect(state.historyPast[0].guideChanges).toHaveLength(1);
    expect(state.historyPast[0].guideChanges![0].kind).toBe('remove');

    // Undo removal
    useCanvasStore.getState().undo();

    // Check guide was restored
    state = useCanvasStore.getState();
    expect(state.guides).toHaveLength(1);
    expect(state.guides[0]).toEqual({ id: guideId, axis: 'y', value: 200 });

    // Redo removal
    useCanvasStore.getState().redo();

    // Check guide was removed again
    state = useCanvasStore.getState();
    expect(state.guides).toHaveLength(0);
  });

  it('should save guide move to history and support undo/redo', () => {
    // Add a guide first
    const guideId = useCanvasStore.getState().addGuide('x', 100);

    // Clear history to focus on move
    useCanvasStore.setState({ historyPast: [], historyFuture: [] });

    // Move the guide
    useCanvasStore.getState().moveGuide(guideId, 150);

    // Check guide was moved
    let state = useCanvasStore.getState();
    expect(state.guides[0].value).toBe(150);

    // Check history was recorded (move is recorded as remove + add)
    expect(state.historyPast).toHaveLength(1);
    expect(state.historyPast[0].guideChanges).toHaveLength(2);
    expect(state.historyPast[0].guideChanges![0].kind).toBe('remove');
    expect(state.historyPast[0].guideChanges![1].kind).toBe('add');

    // Undo move
    useCanvasStore.getState().undo();

    // Check guide was restored to original position
    state = useCanvasStore.getState();
    expect(state.guides[0].value).toBe(100);

    // Redo move
    useCanvasStore.getState().redo();

    // Check guide was moved again
    state = useCanvasStore.getState();
    expect(state.guides[0].value).toBe(150);
  });

  it('should save clear guides to history and support undo/redo', () => {
    // Add multiple guides
    const guide1 = useCanvasStore.getState().addGuide('x', 100);
    const guide2 = useCanvasStore.getState().addGuide('y', 200);

    // Clear history to focus on clear operation
    useCanvasStore.setState({ historyPast: [], historyFuture: [] });

    // Clear all guides
    useCanvasStore.getState().clearGuides();

    // Check guides were cleared
    let state = useCanvasStore.getState();
    expect(state.guides).toHaveLength(0);
    expect(state.activeGuideId).toBe(null);

    // Check history was recorded
    expect(state.historyPast).toHaveLength(1);
    expect(state.historyPast[0].guideChanges).toHaveLength(1);
    expect(state.historyPast[0].guideChanges![0].kind).toBe('clear');

    // Undo clear
    useCanvasStore.getState().undo();

    // Check guides were restored
    state = useCanvasStore.getState();
    expect(state.guides).toHaveLength(2);
    expect(state.guides.find((g) => g.id === guide1)).toEqual({
      id: guide1,
      axis: 'x',
      value: 100,
    });
    expect(state.guides.find((g) => g.id === guide2)).toEqual({
      id: guide2,
      axis: 'y',
      value: 200,
    });

    // Redo clear
    useCanvasStore.getState().redo();

    // Check guides were cleared again
    state = useCanvasStore.getState();
    expect(state.guides).toHaveLength(0);
  });

  it('should handle active guide state correctly during undo/redo', () => {
    // Add a guide and set it as active
    const guideId = useCanvasStore.getState().addGuide('x', 100);
    useCanvasStore.getState().setActiveGuide(guideId);

    // Clear history to focus on removal
    useCanvasStore.setState({ historyPast: [], historyFuture: [] });

    // Remove the active guide
    useCanvasStore.getState().removeGuide(guideId);

    // Check active guide was cleared
    let state = useCanvasStore.getState();
    expect(state.activeGuideId).toBe(null);

    // Undo removal
    useCanvasStore.getState().undo();

    // Check guide was restored but active state was not (this is expected behavior)
    state = useCanvasStore.getState();
    expect(state.guides).toHaveLength(1);
    expect(state.activeGuideId).toBe(null); // Active state is not part of history
  });
});
