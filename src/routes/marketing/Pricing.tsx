import { PageHero, PageBody, Section, P, Bullets, CtaBand } from './parts';

export function Pricing() {
  return (
    <>
      <PageHero
        eyebrow="Free"
        title="QuR Tag is free for up to two items."
        lede="Make an account, add up to two things and print their tags as often as you like. There is nothing to buy."
      />
      <PageBody>
        <Section title="What you get">
          <Bullets
            items={[
              'A tag for each of up to two items.',
              "The page a finder sees when they scan, with your item's name, photo and note.",
              'Your QuR Tag inbox, where you read and reply to finders.',
              'A lost switch, so the tag page says the item is missing.',
            ]}
          />
        </Section>
        <Section title="What you print on">
          <P>
            Plain paper works. Sticker paper works better for bottles and cases. Cover a paper tag with
            clear tape to keep it dry.
          </P>
        </Section>
        <Section title="What we do not sell">
          <P>
            No plans, no tags in a shop, no reward handling. Any thank-you is a note you write yourself.
            To tag a different thing, delete one of your two items and add the new one.
          </P>
        </Section>
      </PageBody>
      <CtaBand title="Make a free tag." />
    </>
  );
}
