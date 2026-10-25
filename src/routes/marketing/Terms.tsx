import { PageHero, PageBody, Section, P, Bullets, ContactLink, DocLink } from './parts';

export function Terms() {
  return (
    <>
      <PageHero eyebrow="Terms" title="Terms of use" lede="The rules for using QuR Tag, in plain words.">
        <p className="text-caption text-muted">Last updated 25 October 2026</p>
      </PageHero>
      <PageBody>
        <Section title="1. Who we are and what this covers">
          <P>
            QuR Tag is run by Impact Consulting AI LLC, a Florida limited liability company ("we", "us").
            These terms apply to everyone who uses qurtag.com: owners who make an account and finders who
            scan a tag. By using QuR Tag you agree to them. Our{' '}
            <DocLink to="/privacy" className="text-ink-900 underline underline-offset-4">privacy policy</DocLink> explains
            how we handle information.
          </P>
        </Section>

        <Section title="2. What QuR Tag does">
          <P>
            QuR Tag lets you print a QR tag for a thing you own. When someone finds it and scans the tag,
            they see a page about the item and can send you a note, and you can reply. QuR Tag is not a
            tracker: it does not locate anything, and it works only if someone finds your thing, scans the
            tag and chooses to write. We do not promise that anything will be returned.
          </P>
        </Section>

        <Section title="3. Plans, prices and payment">
          <Bullets
            items={[
              'Free: up to three items, one person, and the last 30 days of scan history. No payment is taken.',
              'Plus: unlimited items, one person and the full scan history. $19 a year.',
              'Family: Plus for up to five people who share the items and the inbox. $29 a year.',
            ]}
          />
          <P>
            Prices are in US dollars and exclude any sales tax, which is shown at checkout. Plus and Family are subscriptions that renew
            automatically every year until you cancel. You can cancel at any
            time; you keep your plan until the end of the period you already paid for, and nothing more is charged.
            Canceling does not delete anything you made.
          </P>
          <P>
            On the web, payment is taken by Stripe, and you manage or cancel your membership from the Membership page
            in your account. On iPhone, payment is taken by Apple through the App Store. It is charged to your Apple
            ID at confirmation of purchase and renews unless you cancel at least 24 hours before the period ends; you
            manage or cancel it in your iPhone's Settings, under Subscriptions. A membership bought either way applies
            to your QuR Tag account wherever you sign in. If you have bought one both ways, the better plan applies.
          </P>
          <P>
            Refunds for purchases made in the iPhone app are handled by Apple, under Apple's rules, at
            reportaproblem.apple.com. If you think you were charged by mistake on the web, use the Contact us form (in{' '}
            <DocLink to="/help" className="text-ink-900 underline underline-offset-4">Help</DocLink>, or "Question about a charge?" on the Membership page),
            or email <ContactLink /> if you cannot sign in. If we change a price, we will tell you before the new price
            applies to your next renewal.
          </P>
          <P>
            If your membership ends or you move to a lower plan, nothing is deleted. Items over the new limit stay,
            and you can read them, print their tags and delete them, but you cannot change them until you upgrade
            again. Finders can still scan their tags and write to you.
          </P>
        </Section>

        <Section title="4. The Family plan">
          <Bullets
            items={[
              'The person who buys Family is its owner. The owner can invite up to four other people by email. An invite works once, only for the address it was sent to, and expires after seven days.',
              'Everyone in a family sees the same items, tags, scans and inbox, and can change them and reply to finders. Items a person adds while in a family belong to the family and stay if they leave.',
              'Each person keeps their own account and password. What a person made on their own account before joining stays theirs and is not shown to the family.',
              'The owner can remove anyone, and anyone can leave, at any time. Access ends at once.',
              'If the owner deletes their account, the family\'s items are deleted with it. If the Family plan ends, the other people lose access to the family\'s items until it is active again; nothing is deleted.',
            ]}
          />
        </Section>

        <Section title="5. Your account">
          <Bullets
            items={[
              'You must be 18 or over to make an account.',
              'Give a real email address you can read, and keep your password to yourself.',
              'You are responsible for what happens in your account and for the items and notes you add.',
              'Only tag things that are yours, or that you look after for someone in your family.',
            ]}
          />
        </Section>

        <Section title="6. Finders">
          <P>
            Finders do not need an account. A finder agrees to use the page only to help return the item,
            and to write honestly. Returning an item is an arrangement between the finder and the owner. Any
            thank-you the owner offers is their own promise; QuR Tag does not handle money and is not a party
            to it.
          </P>
        </Section>

        <Section title="7. Stay safe">
          <Bullets
            items={[
              'Do not share your home address or phone number unless you want to.',
              'If you meet to hand something over, choose a busy public place, or ask the finder to leave it at a desk, office or shop.',
              'Never pay a finder in advance or send them money through a link.',
              'If someone threatens you or tries to trick you, stop replying, close the conversation and contact the police if you feel unsafe.',
            ]}
          />
        </Section>

        <Section title="8. What you must not do">
          <Bullets
            items={[
              'Use QuR Tag to harass, threaten, scam or spam anyone.',
              'Put illegal, hateful or sexual content in an item, a photo or a note.',
              "Put health details, payment details, government ID numbers or a child's full name in QuR Tag.",
              'Try to read other people\'s items or conversations, guess tag codes, overload the service, or get around its limits.',
              'Use QuR Tag for a business, or resell it, without our written agreement.',
            ]}
          />
        </Section>

        <Section title="9. Notes from finders, reporting and blocking">
          <P>
            QuR Tag has zero tolerance for objectionable content and for abusive users. That means anything
            hateful, harassing, threatening, sexual, violent, illegal or deceptive, and spam, in a note, an item
            name, a photo or a thank-you text. We remove it and block or close the accounts and finders behind it,
            without warning.
          </P>
          <Bullets
            items={[
              'Filter. Every note a finder sends is checked by our system before you see it. A note with offensive words or a threat is held back: you see "This note may be offensive. Show it?" and choose whether to read it. Notes that are only links, or that carry many links, are not delivered, and a finder can only send so many notes in a short time.',
              'Report. Open a conversation and choose Report under any note from a finder. Pick a reason (harassment, spam, threats, inappropriate or other) and add a comment if you like. The note is hidden from you at once. A person at QuR Tag reviews every report within 24 hours and can hide the note for everyone, block the finder, or close the account of anyone who keeps breaking these rules.',
              'Block. Choose Block this finder in a conversation. That finder cannot write to you again, their notes leave your inbox, and they are only told that the conversation is closed. You can see and unblock the finders you blocked in Settings.',
              'Finders. If an owner\'s page or reply is abusive or unsafe, write to us at the address below with the tag page you were on. We review it within 24 hours too.',
            ]}
          />
          <P>
            To report a problem, or to ask us about a decision, email <ContactLink />. Reports are kept private: the
            person reported is never told who made the report.
          </P>
        </Section>

        <Section title="10. Your content">
          <P>
            The items, photos and notes you add stay yours. You let us store and show them only to run
            QuR Tag, for example showing your item's name and photo to someone who scans its tag. We may
            remove content that breaks these terms.
          </P>
        </Section>

        <Section title="11. Ending your use">
          <P>
            You can delete your account at any time from Settings, which also switches off your tags. We may
            suspend or close an account, or block a tag, that breaks these terms or puts someone at risk.
          </P>
        </Section>

        <Section title="12. No warranty">
          <P>
            QuR Tag is provided "as is" and "as available". We work to keep it running and safe, but we do
            not promise it will always be available, free of errors, or that a printed tag will stay
            readable.
          </P>
        </Section>

        <Section title="13. Limits on our liability">
          <P>
            To the extent the law allows, we are not responsible for the loss of, or damage to, any item,
            for what a finder or owner does, or for indirect losses. Our total liability to you for any claim
            is limited to the greater of 100 US dollars and what you paid us in the 12 months before the claim. Nothing in these terms limits
            rights that the law says cannot be limited.
          </P>
        </Section>

        <Section title="14. Law and disputes">
          <P>
            These terms are governed by the laws of the State of Florida, United States, without regard to
            its conflict of law rules. Any dispute will be decided in the state or federal courts located in
            Florida, unless the law where you live gives you the right to bring it elsewhere. Before going to
            court, please email us so we can try to sort it out.
          </P>
        </Section>

        <Section title="15. Changes">
          <P>
            We may update these terms. We will change the date at the top, and put a notice on this site
            before a significant change takes effect. If you keep using QuR Tag after that, the new terms
            apply.
          </P>
        </Section>

        <Section title="16. Contact">
          <P>
            Impact Consulting AI LLC, Florida, United States. Email <ContactLink />.
          </P>
        </Section>
      </PageBody>
    </>
  );
}
