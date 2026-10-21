import { canSee } from '../domain/access';
import { mentionLabel, renderPageRefs } from '../domain/page-refs';
import { fromReference } from '../domain/progress';
import type { NotifyPref, ProgressUnit } from '../domain/types';
import type { DataStore } from '../store/data-store';

export interface NotifyEvent {
  readingId: string;
  kind: 'comment' | 'gif' | 'photo' | 'reaction' | 'reply';
  actorId: string;
  position: number;
  /** Comment excerpt, or the emoji for a reaction. */
  excerpt: string;
  /** Author of the comment being replied to. */
  targetAuthorId?: string;
}

export type Outgoing =
  | { kind: 'dm'; userId: string; content: string }
  | { kind: 'channel'; content: string; mentionIds: string[] };

const MAX_LINES = 10;
const MAX_CONTENT = 1900;

/** `approx`: the page was converted to another edition, so it is only close. */
export function positionLabel(unit: ProgressUnit, position: number, approx = false): string {
  if (position === 0) return 'avant de commencer';
  switch (unit) {
    case 'chapter':
      return `au chapitre ${position}`;
    case 'page':
      return approx ? `vers la page ${position}` : `à la page ${position}`;
    case 'percent':
      return `à ${position} %`;
  }
}

/** `target` is "toi" when the recipient is the one being answered, else their name. */
function describe(event: NotifyEvent, actor: string, where: string, withExcerpt: boolean, target: string): string {
  const excerpt = withExcerpt && event.excerpt ? ` : « ${event.excerpt} »` : '';
  switch (event.kind) {
    case 'reaction':
      return `${actor} a réagi ${event.excerpt} ${where}`;
    case 'gif':
      return `${actor} a posté un GIF ${where}`;
    case 'photo':
      return `${actor} a posté une photo ${where}`;
    case 'comment':
      return `${actor} a commenté ${where}${excerpt}`;
    case 'reply':
      return target === 'toi' ? `${actor} t’a répondu ${where}${excerpt}` : `${actor} a répondu à ${target} ${where}${excerpt}`;
  }
}

function render(title: string, lines: string[]): string {
  const shown = lines.slice(0, MAX_LINES).map((l) => `• ${l}`);
  if (lines.length > MAX_LINES) shown.push(`• … et ${lines.length - MAX_LINES} autre(s)`);
  const content = `📖 **${title}**\n${shown.join('\n')}`;
  return content.length > MAX_CONTENT ? content.slice(0, MAX_CONTENT - 1) + '…' : content;
}

/**
 * Turns a batch of events into messages. A participant is only told about something
 * anchored at a position they have reached, and never about their own actions.
 */
export function buildNotifications(
  events: NotifyEvent[],
  store: DataStore,
  nameOf: (userId: string) => string,
  prefOf: (userId: string) => NotifyPref,
): Outgoing[] {
  const out: Outgoing[] = [];
  const byReading = new Map<string, NotifyEvent[]>();
  for (const e of events) byReading.set(e.readingId, [...(byReading.get(e.readingId) ?? []), e]);

  for (const [readingId, readingEvents] of byReading) {
    const entry = store.readings.get(readingId);
    if (!entry) continue;
    const { unit, total, title } = entry.reading;
    const channelLines: string[] = [];
    const mentionIds = new Set<string>();

    for (const { value: p } of entry.participants.values()) {
      const pref = prefOf(p.userId);
      if (pref === 'none') continue;
      const relevant = readingEvents.filter((e) => e.actorId !== p.userId && canSee(e.position, p.progress));
      if (relevant.length === 0) continue;
      if (pref === 'dm') {
        const approx = !!p.editionTotal && p.editionTotal !== total;
        // Page mentions in excerpts are shown in the recipient's edition.
        const pages = (pos: number) => mentionLabel(unit, fromReference(pos, p.editionTotal, total), approx);
        const lines = relevant.map((e) =>
          describe(
            { ...e, excerpt: renderPageRefs(e.excerpt, pages) },
            nameOf(e.actorId),
            positionLabel(unit, fromReference(e.position, p.editionTotal, total), !!p.editionTotal && p.editionTotal !== total),
            true,
            e.targetAuthorId === p.userId ? 'toi' : nameOf(e.targetAuthorId ?? ''),
          ),
        );
        out.push({ kind: 'dm', userId: p.userId, content: render(title, lines) });
      } else {
        mentionIds.add(p.userId);
      }
    }

    if (mentionIds.size > 0) {
      // Visible to the whole channel: no excerpts, only who did what where.
      // Shared message: pages of the reference edition, said explicitly if some read another one.
      const mixedEditions =
        unit === 'page' && [...entry.participants.values()].some(({ value }) => value.editionTotal && value.editionTotal !== total);
      for (const e of readingEvents) {
        const where = positionLabel(unit, e.position) + (mixedEditions && e.position > 0 ? ' (édition de référence)' : '');
        channelLines.push(describe(e, nameOf(e.actorId), where, false, nameOf(e.targetAuthorId ?? '')));
      }
      const mentions = [...mentionIds].map((id) => `<@${id}>`).join(' ');
      out.push({ kind: 'channel', content: `${render(title, channelLines)}\n${mentions}`, mentionIds: [...mentionIds] });
    }
  }
  return out;
}
