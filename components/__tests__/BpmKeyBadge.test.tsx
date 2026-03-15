import { describe, it, expect } from 'vitest';
import { BpmKeyBadge } from '../BpmKeyBadge';

function getTitle(element: React.JSX.Element): string | undefined {
  return element.props?.title ?? element.props?.children?.props?.title;
}

describe('BpmKeyBadge', () => {
  it('shows placeholder when bpmStatus is null (pending) and no values', () => {
    const result = BpmKeyBadge({ bpmStatus: null });
    expect(result).not.toBeNull();
    expect(result!.props.title).toBe('Audio analysis pending');
  });

  it('shows normal badges when bpmStatus is done with values', () => {
    const result = BpmKeyBadge({ bpm: 128, musicalKey: 'A minor', bpmStatus: 'done' });
    expect(result).not.toBeNull();
    expect(getTitle(result!)).toBeUndefined();
    const children = result!.props.children;
    expect(children).toBeTruthy();
  });

  it('returns null when bpmStatus is failed and no values', () => {
    const result = BpmKeyBadge({ bpmStatus: 'failed' });
    expect(result).toBeNull();
  });

  it('returns null when bpmStatus is no_stream and no values', () => {
    const result = BpmKeyBadge({ bpmStatus: 'no_stream' });
    expect(result).toBeNull();
  });

  it('returns null when bpmStatus is undefined and no values (backwards compat)', () => {
    const result = BpmKeyBadge({});
    expect(result).toBeNull();
  });

  it('shows values even when bpmStatus is null if values exist', () => {
    const result = BpmKeyBadge({ bpm: 140, musicalKey: 'C minor', bpmStatus: null });
    expect(result).not.toBeNull();
    expect(result!.props.title).toBeUndefined();
  });
});
