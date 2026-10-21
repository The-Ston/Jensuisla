<script lang="ts">
  import { onMount } from 'svelte';
  import { mentionLabel, pageToken, splitPageRefs } from '$shared/domain/page-refs';
  import { displayTotal, fromDisplay, toDisplay, type Scale } from '../lib/scale';

  /**
   * Text input where page or chapter mentions ("p.25", "ch.3"), in the reading's unit only, turn
   * into tags as you type, like options of a Discord bot command. Backspace right after a tag
   * turns it back into the text typed. The value is plain text in which tags are stored as
   * tokens holding the position (reference-edition page, or chapter).
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

  // "p.25", "p 25", "p25", "page 25", "pages 25", or "ch.3", "chap 3", "chapitre 3".
  const WORDS: Partial<Record<Scale['unit'], string>> = { page: 'p\\.?|pages?', chapter: 'ch(?:ap)?\\.?|chapitres?' };
  const mention = (end: string, flags: string) =>
    new RegExp(`(?<=^|[\\s(«"'’])(?:${WORDS[scale.unit]})\\s?(\\d{1,5})${end}`, flags);
  // Once followed by a space or punctuation.
  const MENTION = $derived(mention(`(?=[\\s.,;:!?)»"'’])`, 'gi'));
  // Same, ending the text: only used when sending, as the mention can't be "finished" by typing.
  const MENTION_AT_END = $derived(mention('$', 'i'));
  const mentionsEnabled = $derived(scale.unit in WORDS);

  export function focus() {
    el?.focus();
    placeCaretAtEnd();
  }

  function chip(position: number, shown: number): HTMLSpanElement {
    const span = document.createElement('span');
    span.className = 'page-chip';
    span.contentEditable = 'false';
    span.dataset.position = String(position);
    span.textContent = mentionLabel(scale.unit, shown);
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


  /** Converts a mention left at the very end, then returns the final value. */
  export function finalize(): string {
    if (el && mentionsEnabled) {
      const last = lastTextNode();
      const m = last && MENTION_AT_END.exec(last.data);
      if (last && m && inBook(m)) replaceWithTag(last, m);
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

  function inBook(m: RegExpMatchArray): boolean {
    const shown = Number(m[1]);
    return shown >= 1 && shown <= displayTotal(scale);
  }

  /** Replaces a mention matched in a text node with a tag. Returns the text node that followed it. */
  function replaceWithTag(node: Text, m: RegExpMatchArray): Text {
    const shown = Number(m[1]);
    const after = node.splitText(m.index!);
    const rest = after.splitText(m[0].length);
    const tag = chip(fromDisplay(scale, shown), shown);
    tag.dataset.typed = m[0];
    after.replaceWith(tag);
    return rest;
  }

  function caret(): { node: Text; offset: number } | null {
    const sel = getSelection();
    if (!sel || !sel.isCollapsed || sel.anchorNode?.nodeType !== Node.TEXT_NODE) return null;
    return { node: sel.anchorNode as Text, offset: sel.anchorOffset };
  }

  function placeCaret(node: Text, offset: number) {
    const range = document.createRange();
    range.setStart(node, offset);
    range.collapse(true);
    const sel = getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }

  // Where a paste started, so that every mention it contains gets converted.
  let pasteFrom: { node: Text | null; offset: number } | null = null;

  /**
   * Turns into tags the mentions just finished before the caret: by the last character typed,
   * or anywhere in the pasted text. Mentions elsewhere are left alone, so that a tag turned back
   * into text stays text.
   */
  function convertBeforeCaret() {
    if (!el || !mentionsEnabled) return;
    const at = caret();
    if (!at) return;
    const from = pasteFrom ? (pasteFrom.node === at.node ? pasteFrom.offset : 0) : at.offset - 1;
    const found = [...at.node.data.slice(0, at.offset).matchAll(MENTION)].filter(
      (m) => m.index! + m[0].length >= from && inBook(m),
    );
    // From the last one, so that earlier matches keep their offsets in the node left in front.
    let caretAfter: { node: Text; offset: number } | null = null;
    for (const m of found.reverse()) {
      const rest = replaceWithTag(at.node, m);
      caretAfter ??= { node: rest, offset: at.offset - m.index! - m[0].length };
    }
    if (caretAfter) placeCaret(caretAfter.node, caretAfter.offset);
  }

  function onInput(event: Event) {
    // Never rewrite the text while a keyboard is composing (Android, accents…).
    if (!(event as InputEvent).isComposing) convertBeforeCaret();
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
        const text = document.createTextNode(tag.dataset.typed ?? tag.textContent ?? '');
        tag.replaceWith(text);
        placeCaret(text, text.length);
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
    // Not in a text node: the pasted text starts a new one, scanned from its start.
    pasteFrom = caret() ?? { node: null, offset: 0 };
    document.execCommand('insertText', false, text);
    pasteFrom = null;
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
