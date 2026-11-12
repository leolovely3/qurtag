import { PageHero, PageBody, Section, P, Bullets, CtaBand, DocLink } from './parts';

/**
 * "Make it last": plain, brand-neutral advice for turning a printed tag into one that survives
 * rain, washing machines and school bags. It names no brands and links to no shops. The website
 * and the iPhone app show this same page (Help and the tag page link to it).
 */
export function MakeItLast() {
  return (
    <>
      <PageHero
        eyebrow="Make it last"
        title="Make your tag last."
        lede="A tag only helps if it is still readable when someone finds your thing. Here is what to print on, what to cover it with, and where to put it."
      />
      <PageBody>
        <Section title="Pick a style that suits the thing">
          <Bullets
            items={[
              'Small sticker or label strip: bottles, chargers, glasses cases, remotes, lunchboxes, instrument cases and laptops.',
              'Key fob insert: a key ring or zipper pull with a clear photo holder.',
              'Wallet card: slides into a clear card holder for a bag, a wallet or a walker.',
              'Bag tag: backpacks, gym bags and luggage.',
              'Clothing strip: jackets and school clothes, on iron-on transfer paper.',
            ]}
          />
          <P>
            Choose it on the tag page, in the app or on the website. The page prints a few spare copies for the one that goes
            through the wash, and Print several items on one page puts the bottle, the bag and the keys on one sheet.
          </P>
        </Section>

        <Section title="No printer at home?">
          <Bullets
            items={[
              'Save the PDF on the tag page and print it at a library, a print shop or an office supply store. Ask for 100% (actual size).',
              'Or email the PDF to yourself and print it on a computer at work or at a friend’s.',
              'Inside the Facebook or Instagram app, printing usually does nothing. Open the page in Safari or Chrome first.',
            ]}
          />
        </Section>

        <Section title="Stickers that stay stuck">
          <Bullets
            items={[
              'Print on weatherproof vinyl sticker paper. There is one kind for inkjet printers and one for laser printers, so buy the one that matches your printer.',
              'Or use self-laminating sheets: you print on the sheet and its clear cover peels off and goes over the top.',
              'Or print on plain sticker paper or ordinary paper and cover it with clear packing tape, overlapping the edges so water cannot creep underneath.',
              'Let ink dry for a few minutes before you cover or stick anything, and do not touch it with damp hands.',
              'Clean the surface with rubbing alcohol first, let it dry, then press the sticker down hard from the middle to the edges.',
            ]}
          />
        </Section>

        <Section title="Holders and tags that hang">
          <Bullets
            items={[
              'Clear credit card luggage tag holders take a wallet card or a bag tag and keep rain off it. Pick one with a strap or loop that closes.',
              'Keychain photo inserts hold a key fob insert on both sides. Fold the insert once and slide it in.',
              'Adhesive label pockets stick to the inside of a bag or a case and let you swap the paper tag later.',
              'Zip ties and split rings hold a tag on a bag handle or a zipper pull. A zip tie is harder to lose than a clip, and a split ring stays on a key ring.',
              'Use thick paper or light card for anything that hangs, so it does not curl.',
            ]}
          />
        </Section>

        <Section title="Clothing">
          <Bullets
            items={[
              'Use iron-on transfer paper that matches your printer, and follow its instructions for heat and time.',
              'Some transfer paper says to print mirrored. If yours does, tick Print mirrored on the tag page, and the page is flipped for you.',
              'Iron it inside the collar, on a care label, or on the inside of a pocket, where it is out of sight and out of the sun.',
              'Wash the garment inside out and on a cool setting. Skip the tumble dryer for the first few washes.',
            ]}
          />
        </Section>

        <Section title="Curved bottles and rough surfaces">
          <Bullets
            items={[
              'Put the tag on the flattest part, away from seams and ridges, so the code lies flat and the edges do not lift.',
              'On a curved bottle use the small sticker. A narrow tag wraps less and the QR code stays square.',
              'Round the corners of a sticker with scissors. Square corners catch and peel first.',
              'Avoid places that get very hot or are gripped all day. The underside of a lid or the back of a case lasts longer.',
              'Do not wrap the QR code round a tight curve. If a scanner cannot see it flat, it may not read it.',
            ]}
          />
        </Section>

        <Section title="Keep the code readable">
          <Bullets
            items={[
              'Print at 100% (actual size), never "fit to page". The code must stay at least about 0.75 inch (2 cm) wide.',
              'Keep it black on white, and do not fold, crease or crop the white edge around the code.',
              'Scan it yourself with your phone camera once it is on. If it opens your item’s page, you are done.',
              'The short code printed beside it, such as qurtag.com/k7m2p4, works if the code gets scuffed. Anyone can type it.',
            ]}
          />
        </Section>

        <Section title="Want it made for you?">
          <P>
            On the tag page, choose Get a print-ready file. You get a PNG and a PDF of the tag at exact size with bleed, which
            you can upload to any online sticker printer to have it made on waterproof vinyl. Ask for a matte or gloss finish and
            the shape you like when you order.
          </P>
          <P>
            QuR Tag does not sell tags or stickers, and we do not recommend a shop. The tag is free; the paper is up to you.
          </P>
        </Section>

        <Section title="If it gets damaged or lost">
          <P>
            Print it again from your item. If the tag itself went missing and you want the old one to stop working, make a new code
            there. See <DocLink to="/help" className="text-ink-900 underline underline-offset-4">Help</DocLink> for more.
          </P>
        </Section>
      </PageBody>
      <CtaBand title="Print your first tag." />
    </>
  );
}
