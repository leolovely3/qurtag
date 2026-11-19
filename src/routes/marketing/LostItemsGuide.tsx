import { LOST_ITEMS_GUIDE as G } from '@/lib/lostItemsGuide';
import { PageHero, PageBody, Section, P, Bullets, CtaBand, DocLink } from './parts';

/**
 * A guide for people searching for QR stickers for lost items: the question is the only heading
 * level one, and the first paragraph answers it. The words are in src/lib/lostItemsGuide.ts.
 */
export function LostItemsGuide() {
  return (
    <>
      <PageHero eyebrow="Guide" title={G.h1} lede={G.answer} />
      <PageBody>
        {G.sections.map((s) => (
          <Section key={s.title} title={s.title}>
            {s.paragraphs?.map((p) => <P key={p}>{p}</P>)}
            {s.bullets && <Bullets items={s.bullets} />}
          </Section>
        ))}
        <P>
          More detail is in{' '}
          <DocLink to="/how-it-works" className="text-ink-900 underline underline-offset-4">How it works</DocLink> and{' '}
          <DocLink to="/make-it-last" className="text-ink-900 underline underline-offset-4">Make your tag last</DocLink>.
        </P>
      </PageBody>
      <CtaBand title="Print your first tag." />
    </>
  );
}
