import { PageHero, PageBody, Section, P, Bullets, CtaBand } from './parts';

export function Tags() {
  return (
    <>
      <PageHero
        eyebrow="Your tag"
        title="A QR code you print at home."
        lede="Each tag has a QR code and a short code underneath it. Print it on plain paper or sticker paper, then put it on the thing."
      />
      <PageBody>
        <Section title="What is on the tag">
          <Bullets
            items={[
              "A QR code that opens your item's page when a finder scans it with their phone camera.",
              'A short code printed with it, so the tag can be told apart from your other tag.',
            ]}
          />
        </Section>
        <Section title="Tips for sticking it on">
          <Bullets
            items={[
              'Use sticker paper for bottles, helmets, instrument cases and gym bags.',
              'Cover a paper tag with clear tape so rain and sweat do not smudge it.',
              'Slide it into a luggage sleeve or a key-ring tag holder for bags and keys.',
              'Tuck it inside a lid, a pocket or a glasses case where it stays dry.',
              'Keep the code flat and clear of folds, and print it at least 2 cm (about 1 inch) wide.',
            ]}
          />
        </Section>
        <Section title="If it gets damaged or lost">
          <P>
            Print it again from your item's page in QuR Tag. If the tag itself went missing and you want
            the old one to stop working, make a new code there: the old tag stops working at once.
          </P>
        </Section>
      </PageBody>
      <CtaBand title="Print your first tag." />
    </>
  );
}
