<script lang="ts">
  import { onMount } from 'svelte';
  import { pageToken, splitPageRefs } from '$shared/domain/page-refs';
  import { displayTotal, fromDisplay, toDisplay, type Scale } from '../lib/scale';

  /**
   * Text input where page mentions ("p.25", "page 25") turn into tags as you type, like options
   * of a Discord bot command. A tag is deleted with one backspace. The value is plain text in
   * which tags are stored as tokens holding the reference-edition page.
   */
  let {
    value = $bindable(),
    scale,
    id,
    placeholder = '',
    label,
    onKeydown,
  }: {
    value: string;
    scale: Scale;
    id: string;
    placeholder?: string;
    label: string;
    /** Called before the default handling; call preventDefault() to take over a key. */
    onKeydown?: (event: KeyboardEvent) => void;
  } = $props();

  let el: HTMLDivElement | undefined = $state();
  // Last value produced by this editor: lets us tell our own updates from external ones.
  let lastValue: string | null = null;

  // "p.25", "p 25", "p25", "page 25", "pages 25", once followed by a space or punctuation.
  const MENTION = /(^|[\s(«"'’])((?:p\.?|pages?)\s?(\d{1,5}))([\s.,;:!?)»"'’])/i;
  const pagesEnabled = $derived(scale.unit === 'page');

  export function focus() {
    el?.focus();
    placeCaretAtEnd();
  }

  function chip(position: number, shown: number): HTMLSpanElement {
    const span = document.createElement('span');
    span.className = 'page-chip';
    span.contentEditable = 'false';
    span.dataset.position = String(position);
    span.textContent = `p. ${shown}`;
    return span;
  }

  function render(text: string) {
    if (!el) return;
    el.replaceChildren();
    for (const seg of splitPageRefs(text)) {
      if (seg.kind === 'page') {
        el.append(chip(seg.position, toDisplay(scale, seg.position)));
        continue;
      }
      seg.text.split('\n').forEach((line, i) => {
        if (i > 0) el!.append(document.createElement('br'));
        if (line) el!.append(document.createTextNode(line));
      });
    }
  }

  function serialize(node: Node): string {
    let out = '';
    node.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) out += (child.nodeValue ?? '').replace(/​/g, '');
      else if (child instanceof HTMLElement) {
        if (child.dataset.position) out += pageToken(Number(child.dataset.position));
        else if (child.tagName === 'BR') out += '\n';
        else {
          // Some browsers wrap new lines in <div>s.
          if (out && !out.endsWith('\n')) out += '\n';
          out += serialize(child);
        }
      }
    });
    return out;
  }

  function sync() {
    if (!el) return;
    lastValue = serialize(el).replace(/\n$/, '');
    value = lastValue;
  }

  function placeCaretAtEnd() {
    if (!el) return;
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }

  // Same, ending the text: only used when sending, as the mention can't be "finished" by typing.
  const MENTION_AT_END = /(^|[\s(«"'’])((?:p\.?|pages?)\s?(\d{1,5}))()$/i;

  /** Converts a mention left at the very end, then returns the final value. */
  export function finalize(): string {
    if (el && pagesEnabled) {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let last: Text | null = null;
      for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) last = node;
      if (last && last === lastTextNode()) convertMention(last, MENTION_AT_END);
      sync();
    }
    return value;
  }

  /** The text node that ends the content, if the content ends with text. */
  function lastTextNode(): Text | null {
    let node = el?.lastChild ?? null;
    while (node && node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).tagName === 'BR') node = node.previousSibling;
    return node && node.nodeType === Node.TEXT_NODE ? (node as Text) : null;
  }

  /** Turns the first complete page mention found into a tag. Returns true if it did. */
  function convertMention(only?: Text, pattern = MENTION): boolean {
    if (!el || !pagesEnabled) return false;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
      if (only && node !== only) continue;
      const m = pattern.exec(node.data);
      if (!m) continue;
      const shown = Number(m[3]);
      if (shown < 1 || shown > displayTotal(scale)) continue;
      const start = m.index + m[1]!.length;
      const after = node.splitText(start);
      const rest = after.splitText(m[2]!.length); // rest starts with the delimiter
      const tag = chip(fromDisplay(scale, shown), shown);
      after.replaceWith(tag);
      // Caret right after the delimiter that triggered the conversion.
      const range = document.createRange();
      range.setStart(rest, Math.min(1, rest.length));
      range.collapse(true);
      const sel = getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      return true;
    }
    return false;
  }

  function onInput(event: Event) {
    // Never rewrite the text while a keyboard is composing (Android, accents…).
    if (!(event as InputEvent).isComposing) while (convertMention()) {}
    sync();
  }

  /** The tag right before a collapsed caret, if any. */
  function tagBeforeCaret(): HTMLElement | null {
    const sel = getSelection();
    if (!sel || !sel.isCollapsed || !sel.anchorNode) return null;
    let node: Node | null = sel.anchorNode;
    let offset = sel.anchorOffset;
    if (node.nodeType === Node.TEXT_NODE) {
      if (offset > 0) return null;
      node = node.previousSibling;
    } else {
      node = node.childNodes[offset - 1] ?? null;
    }
    // Skip empty text nodes left behind by edits.
    while (node && node.nodeType === Node.TEXT_NODE && !node.nodeValue) node = node.previousSibling;
    return node instanceof HTMLElement && node.dataset.position ? node : null;
  }

  function onKey(event: KeyboardEvent) {
    onKeydown?.(event);
    if (event.defaultPrevented) return;
    if (event.key === 'Backspace') {
      const tag = tagBeforeCaret();
      if (tag) {
        event.preventDefault();
        tag.remove();
        sync();
      }
    } else if (event.key === 'Enter' && event.shiftKey) {
      event.preventDefault();
      document.execCommand('insertLineBreak');
    }
  }

  function onPaste(event: ClipboardEvent) {
    // Plain text only: no formatting or images pasted from elsewhere.
    event.preventDefault();
    const text = event.clipboardData?.getData('text/plain') ?? '';
    document.execCommand('insertText', false, text);
  }

  onMount(() => {
    render(value);
    lastValue = value;
  });

  // External changes (cleared after sending, comment loaded for editing) rebuild the content.
  $effect(() => {
    if (value !== lastValue) {
      render(value);
      lastValue = value;
    }
  });
</script>

<div
  bind:this={el}
  {id}
  class="rich"
  class:empty={!value}
  contenteditable="true"
  role="textbox"
  tabindex="0"
  aria-multiline="true"
  aria-label={label}
  data-placeholder={placeholder}
  oninput={onInput}
  onkeydown={onKey}
  onpaste={onPaste}
  oncompositionend={onInput}
></div>

<style>
  .rich {
    flex: 1;
    min-width: 0;
    min-height: 32px;
    max-height: 160px;
    overflow-y: auto;
    padding: 6px 4px;
    line-height: 1.5;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    outline: none;
    cursor: text;
  }
  .rich.empty::before {
    content: attr(data-placeholder);
    color: var(--muted);
    pointer-events: none;
  }
  .rich :global(.page-chip) {
    display: inline-block;
    padding: 0 6px;
    margin: 0 1px;
    border-radius: 6px;
    border: 1px solid var(--me);
    background: rgba(106, 169, 255, 0.15);
    color: var(--me);
    font-weight: 600;
    font-size: 0.92em;
    line-height: 1.4;
    user-select: all;
  }
</style>
