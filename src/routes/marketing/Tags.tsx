import { Link } from 'react-router-dom';
import { PageHero, PageBody, Section, P, Bullets, CtaBand } from './parts';

export function Tags() {
  return (
    <>
      <PageHero
        eyebrow="Your tag"
        title="A QR code you print at home."
        lede="Pick a style for the thing, print a page of copies on paper you already have or on sticker paper, and put one on. A short code is printed beside every QR code."
      />
      <PageBody>
        <Section title="Six styles to choose from">
          <Bullets
            items={[
              'Small sticker, 1 inch square: bottles, chargers, glasses cases, remotes.',
              'Label strip, 2.625 x 1 inch: lunchboxes, instrument cases, laptops. On US Letter it lines up with the standard 30 per sheet address label sheet.',
              'Key fob insert, about 1 x 1.4 inches, printed on both sides: key rings and zip pulls with a clear photo holder.',
              'Wallet card, credit card size: bag tags, wallets, walkers.',
              'Bag tag, a bigger fold-over card with "If found" in large letters: backpacks, gym bags and luggage.',
              'Clothing strip for iron-on transfer paper, with a mirrored option: jackets, school clothes, sports kit.',
            ]}
          />
          <P>
            Each style comes in three looks: Clean, Bold and Playful (friendly, and still high contrast, for kids' things). Pages
            print on US Letter or A4, with several copies so you have spares.
          </P>
        </Section>
        <Section title="What is on the tag">
          <Bullets
            items={[
              "A QR code that opens your item's page when a finder scans it with their phone camera. It is never printed smaller than about 0.75 inch (2 cm), and it keeps a clear border so phones read it first time.",
              'A short code printed beside it, such as qurtag.com/k7m2p. Anyone can type it, so the tag still works if the QR code gets scuffed.',
              'The words "If found, scan", so a stranger knows what to do.',
            ]}
          />
        </Section>
        <Section title="Make it last">
          <P>
            Weatherproof vinyl sticker paper, self-laminating sheets, clear packing tape over a paper tag, clear card holders,
            keychain photo inserts, zip ties and iron-on transfer paper all work. Our{' '}
            <Link to="/make-it-last" className="text-ink-900 underline underline-offset-4">
              Make it last guide
            </Link>{' '}
            says which to use where, with tips for curved bottles and the washing machine.
          </P>
          <P>
            Want it professionally made? Choose Get a print-ready file on the tag page. You get a PNG and a PDF at exact size with
            bleed, to upload to any online sticker printer for waterproof vinyl. QuR Tag does not sell tags or stickers.
          </P>
        </Section>
        <Section title="If it gets damaged or lost">
          <P>
            Print it again from your item's page in QuR Tag. If the tag itself went missing and you want the old one to stop working,
            make a new code there: the old tag, and its short code, stop working at once.
          </P>
        </Section>
      </PageBody>
      <CtaBand title="Print your first tag." />
    </>
  );
}
