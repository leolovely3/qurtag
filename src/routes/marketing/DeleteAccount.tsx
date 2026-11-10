import { PageHero, PageBody, Section, P, Bullets, ContactLink, DocLink } from './parts';

/**
 * /delete-account: how to delete a QuR Tag account, on a public page that needs no sign-in.
 * Google Play asks every app that lets people make an account for a web address that says how
 * to delete it without the app. Every statement matches the code: delete_my_account in
 * db/membership.sql (refused while a membership still renews; then the account row goes and
 * every table that refers to it goes with it), the Account screen (src/routes/app/Account.tsx)
 * and the Contact us queue (db/support.sql keeps a sent message, without the account).
 */
export function DeleteAccount() {
  return (
    <>
      <PageHero eyebrow="Account" title="Delete your QuR Tag account" lede="How to delete your account and everything in it, in the app or by email.">
        <p className="text-caption text-muted">QuR Tag, by Impact Consulting AI LLC</p>
      </PageHero>
      <PageBody>
        <Section title="In the app or on the website">
          <Bullets
            items={[
              'Sign in to QuR Tag in the Android app, the iPhone app or at qurtag.com/app.',
              'Open Settings, then tap your name to open Account.',
              'Choose Delete my account, then Delete everything.',
            ]}
          />
          <P>
            If you want a copy first, choose Download my data on the same screen. If you pay for Plus or Family and it still
            renews, cancel it first (Membership, then Manage), so you are not charged for an account that no longer
            exists. The app tells you if this is needed.
          </P>
        </Section>

        <Section title="If you cannot sign in">
          <P>
            Email <ContactLink /> from the address you signed up with and ask us to delete your QuR Tag account. We reply to
            confirm once it is deleted.
          </P>
        </Section>

        <Section title="What is deleted">
          <Bullets
            items={[
              'Your account: your email address, name, password and sign-in records.',
              'Your items, their photos and notes, and their tags. Any tag you printed stops working.',
              'Scans of your tags and your conversations with finders.',
              'Your membership records, your notification choices and, in the iPhone app, the phone alerts registration.',
            ]}
          />
          <P>
            It is deleted at once and cannot be brought back. Copies in our providers' backups are replaced on their normal
            schedule. A message you sent us through Contact us is kept, without your account, until the question is dealt
            with. A subscription bought through Google Play or the App Store is also listed in that store's own purchase
            history, under their rules.
          </P>
          <P>
            Read more in the <DocLink to="/privacy" className="text-ink-900 underline underline-offset-4">privacy policy</DocLink>.
          </P>
        </Section>
      </PageBody>
    </>
  );
}
