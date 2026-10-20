import { flushSync, mount, unmount } from 'svelte';
import { afterEach, describe, expect, it } from 'vitest';
import RichInput from '../src/components/RichInput.svelte';
import { makeScale, type Scale } from '../src/lib/scale';

let component: ReturnType<typeof mount> | null = null;

function setup(scale: Scale, initial = '') {
  const target = document.createElement('div');
  document.body.append(target);
  const props = $state({ value: initial });
  component = mount(RichInput, {
    target,
    props: {
      get value() {
        return props.value;
      },
      set value(v: string) {
        props.value = v;
      },
      scale,
      id: 'x',
      label: 'x',
    },
  });
  flushSync();
  const el = target.querySelector('.rich') as HTMLDivElement;
  return { el, props, api: component as unknown as { finalize: () => string } };
}

/** Simulates typing: puts the text in a text node with the caret at its end, then fires input. */
function type(el: HTMLDivElement, text: string) {
  const node = document.createTextNode(text);
  el.append(node);
  const range = document.createRange();
  range.setStart(node, text.length);
  range.collapse(true);
  getSelection()!.removeAllRanges();
  getSelection()!.addRange(range);
  el.dispatchEvent(new InputEvent('input', { bubbles: true }));
  flushSync();
}

afterEach(() => {
  if (component) unmount(component);
  component = null;
  document.body.replaceChildren();
});

describe('RichInput', () => {
  const reference = makeScale('page', 352, null);

  it('turns "p.25 " into a page tag', () => {
    const { el, props } = setup(reference);
    type(el, 'je me rappelle de la p.25 ');
    expect(props.value).toBe('je me rappelle de la [[p:25]] ');
    expect(el.querySelector('.page-chip')?.textContent).toBe('p. 25');
  });

  it('recognizes the usual spellings, and not words containing p', () => {
    for (const [typed, expected] of [
      ['page 12,', '[[p:12]],'],
      ['p 7 ', '[[p:7]] '],
      ['(p12)', '([[p:12]])'],
      ['top 5 ', 'top 5 '],
      ['p.999 ', 'p.999 '], // beyond the book
    ]) {
      const { el, props } = setup(reference);
      type(el, typed);
      expect(props.value).toBe(expected);
      unmount(component!);
      component = null;
    }
  });

  it('converts pages typed in another edition to the reference', () => {
    const { el, props } = setup(makeScale('page', 352, 410));
    type(el, 'p.120 ');
    expect(props.value).toBe('[[p:103]] ');
    expect(el.querySelector('.page-chip')?.textContent).toBe('p. 120');
  });

  it('deletes a whole tag with one backspace', () => {
    const { el, props } = setup(reference);
    type(el, 'vu p.25 ');
    // Caret right after the tag (before the space).
    const space = el.lastChild!;
    const range = document.createRange();
    range.setStart(space, 0);
    range.collapse(true);
    getSelection()!.removeAllRanges();
    getSelection()!.addRange(range);
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true }));
    flushSync();
    expect(props.value).toBe('vu  ');
    expect(el.querySelector('.page-chip')).toBeNull();
  });

  it('converts a mention left at the end when sending', () => {
    const { el, api } = setup(reference);
    type(el, 'voir p.25');
    expect(api.finalize()).toBe('voir [[p:25]]');
  });

  it('shows existing tags when editing', () => {
    const { el } = setup(makeScale('page', 352, 410), 'cf [[p:103]] ok');
    expect(el.querySelector('.page-chip')?.textContent).toBe('p. 120');
  });

  it('leaves chapter readings alone', () => {
    const { el, props } = setup(makeScale('chapter', 22, null));
    type(el, 'p.5 ');
    expect(props.value).toBe('p.5 ');
  });
});
