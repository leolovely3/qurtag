import { PageHero, PageBody, Section, P, Bullets, ContactLink } from './parts';

/**
 * QuR Tag's privacy policy. Every statement here must match what the code does: the
 * tables in db/qurtag.sql, the finder routes (server/routes/finder.ts), the sign-in
 * service (server/auth/qurtagAuth.ts) and the browser storage in src/lib/finder.ts.
 * Change this page in the same pull request as any change to what QuR Tag collects.
 */
export function Privacy() {
  return (
    <>
      <PageHero eyebrow="Privacy" title="Privacy policy" lede="What QuR Tag collects, why, who can see it, and how to get it deleted.">
        <p className="text-caption text-muted">Last updated 26 October 2026</p>
      </PageHero>
      <PageBody>
        <Section title="Who we are">
          <P>
            QuR Tag is run by Impact Consulting AI LLC, a Florida limited liability company ("we", "us").
            This policy covers the QuR Tag website and app at qurtag.com, including the page a finder sees
            after scanning a tag. Questions: <ContactLink />.
          </P>
        </Section>

        <Section title="1. The short version">
          <Bullets
            items={[
              'We collect what we need to let a finder reach you about a lost thing, and nothing more.',
              'A finder sees your item, never your name, email or phone number.',
              'Finders do not make an account. We do not record where they are.',
              'We do not sell your information and we show no ads.',
              'You can download your data or delete your account yourself, at any time, from Settings.',
            ]}
          />
        </Section>

        <Section title="2. What we collect from owners">
          <Bullets
            items={[
              'Account: your email address, the first name you give us, and your password, which is stored only as a secure hash.',
              'Sign-in records: when you sign in, the network (IP) address and browser type of that sign-in, kept with the session so we can keep accounts safe.',
              'Items you add (up to three on the Free plan): the name, an optional description, an optional photo (we shrink it on your device before it is saved), an optional note for the finder, an optional private note, and whether you marked it lost.',
              'Tags: the code of each tag you make and whether it is switched on.',
              'Conversations: the notes you and a finder write to each other, and when they were read.',
              'Membership, if you buy one: which plan you have, whether it renews, when it ends, and the reference numbers Stripe or Apple give the subscription. We do not receive or keep your card number.',
              'Messages you send through the Contact us form: the text, the topic, the email address to reply to, and, if you were signed in, your account and plan. We keep them until the question is dealt with and as long after as we need to answer follow-ups.',
              'Notifications, if you allow them in the iPhone app: your phone\'s device token (a code Apple gives the app so that our server can send it alerts), whether the app is a test or a live build, and the notification choices you make in Settings. We keep the token until you sign out, delete your account, or Apple tells us it no longer works.',
              'Family, if you use it: the email address you invite, until the invite is used, canceled or has expired (and for 30 days after), and the names and email addresses of the people in the family, which they can all see.',
            ]}
          />
        </Section>

        <Section title="3. What we collect when someone scans a tag">
          <Bullets
            items={[
              'A scan record: the time, which tag was scanned, and a rough device type (for example "iPhone" or "Android phone"). We do not keep the finder\'s network address or location with it.',
              'If the finder writes: their notes. Anything they choose to write, such as where they found the item, is part of the note.',
              'A private conversation key. When a finder sends their first note, we give their browser a random key so it can reopen that conversation. The key stays in their browser; we keep only a scrambled (hashed) form of it, which cannot be turned back into the key.',
            ]}
          />
        </Section>

        <Section title="4. What we do not collect">
          <P>
            We do not collect or store payment card or bank details: payments are taken by Stripe (on the
            web) or Apple (in the app), and we never see the card number. We do not collect government ID,
            health or medical information, or precise location. There is no field for any of these, and we
            ask you not to put them in an item name, a note or a message. Please do not put a child's full name on a tag.
          </P>
        </Section>

        <Section title="5. How we use it">
          <Bullets
            items={[
              'To run QuR Tag: show the finder the item, deliver notes between you, and show you your inbox.',
              'To keep it safe: sign-in limits, stopping abuse and spam, and fixing faults.',
              'To count how QuR Tag is used, as totals only (for example, how many tags were scanned this month).',
              'To answer you when you write to us.',
            ]}
          />
          <P>We do not use your information for advertising, and we do not sell or rent it to anyone.</P>
        </Section>

        <Section title="6. Who can see it">
          <Bullets
            items={[
              "A finder who scans your tag sees the item's name, its photo, your note for the finder, and whether it is marked lost. Nothing else about you.",
              'You see the notes a finder writes about your items. The finder sees your replies.',
              'Other people in your family, if you are in one, see the family\'s items, tags, scans and inbox, and the names and email addresses of the people in the family. They do not see anything you made on your own account before you joined.',
              'We can see stored data when we need to run or repair QuR Tag, stop abuse, or meet a legal duty.',
              'We may share information if the law requires it, to protect someone from harm, or as part of a sale or merger of our business, in which case this policy keeps applying to it.',
            ]}
          />
        </Section>

        <Section title="7. Our service providers">
          <P>These companies process data for us only so that QuR Tag works, under their own data protection terms:</P>
          <Bullets
            items={[
              'Vercel Inc. hosts the website and runs our server code. Like any web host it keeps short-lived request logs, which include network addresses.',
              'Supabase Inc. runs the database where your account, items, tags and conversations are stored, in the United States.',
              'Stripe, Inc. takes card payments on the web and runs the payment and membership pages you are sent to. It receives your email address, your card details (which it keeps, not us) and your payment history, under its own privacy policy.',
              'Apple Inc. takes payment for memberships bought in the iPhone app, under Apple\'s own terms and privacy policy. We receive only whether a subscription is active, which plan it is and when it ends.',
              'Apple Inc. also delivers the alerts we send to your iPhone (the Apple Push Notification service). It receives your device token and the text of each alert: the item\'s name and the finder\'s note, or only "You have a new note" if you chose to hide the note on the lock screen. We use no other push service.',
              'RevenueCat, Inc. records iPhone app subscriptions for us and tells our server when one starts, renews or ends. It receives your QuR Tag account number (a random identifier, not your email address), your purchase records from Apple, and technical details of your device and network address.',
              'Resend (Resend, Inc.) sends our email: the link to reset your password, and the emails that confirm your address, tell you a finder wrote (at once, or as a copy ten minutes after an alert you have not opened), or carry a family invite. It receives your email address and the text of that email.',
            ]}
          />
        </Section>

        <Section title="8. Cookies and browser storage">
          <P>
            Owners get one sign-in cookie, which keeps you signed in. A finder's browser stores the private
            conversation key described above, so they can come back to their conversation. We use no
            advertising or tracking cookies and no third-party analytics. If you pay on the web, the payment page is
            Stripe's and uses Stripe's own cookies.
          </P>
        </Section>

        <Section title="9. How long we keep it">
          <Bullets
            items={[
              'Your account, items, tags, scans and conversations: until you delete them or your account.',
              'Deleting an item deletes its tags, scans and conversations at once, and its tag stops working.',
              'Deleting your account deletes everything above at once. Copies in our providers\' backups are replaced on their normal schedule.',
              'Sign-in records end when the session ends or expires.',
              'Your phone\'s device token: until you sign out of the app or delete your account, or until Apple tells us it is no longer valid.',
              'Membership records: while your account exists. Deleting your account deletes them here; Stripe, Apple and RevenueCat keep their own records under their own rules. Cancel a membership that is still renewing before you delete your account, so you are not charged.',
            ]}
          />
        </Section>

        <Section title="10. Your choices and rights">
          <Bullets
            items={[
              'See and change your items at any time in the app.',
              'Download your data: Settings, then Download my data.',
              'Delete your account: Settings, then Delete my account. It takes effect at once. A membership that is still renewing must be canceled first.',
              'Cancel a membership: on the web, Membership, then Manage membership. On iPhone, Settings, your name, Subscriptions. You keep your plan until the end of the period you paid for.',
              'A finder who wants their notes removed can email us with the tag code and roughly when they wrote.',
              <>
                For anything else, including a question about the law where you live, email <ContactLink />. We
                answer requests within 30 days.
              </>,
            ]}
          />
        </Section>

        <Section title="11. Security">
          <P>
            QuR Tag is served over HTTPS only. Passwords and finders' conversation keys are stored hashed.
            QuR Tag's data sits in its own part of our database, reached through separate logins that can
            reach nothing else, and a finder's page can only read the item card and that finder's own
            conversation. No system is perfectly secure; if we learn of a breach that affects you, we will
            tell you as the law requires.
          </P>
        </Section>

        <Section title="12. Children">
          <P>
            You must be 18 or over to make an account. A parent or carer can tag a child's things from
            their own account. A finder can be any age; we do not ask finders who they are.
          </P>
        </Section>

        <Section title="13. Changes">
          <P>
            If we change this policy, we will update the date at the top. If a change is significant, we
            will put a notice on this site before it takes effect.
          </P>
        </Section>

        <Section title="14. Contact">
          <P>
            Impact Consulting AI LLC, Florida, United States. Email <ContactLink />.
          </P>
        </Section>
      </PageBody>
    </>
  );
}
