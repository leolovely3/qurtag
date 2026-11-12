import { PageHero, PageBody, P, PrimaryLink, SecondaryLink } from './parts';

/** An address the site does not have. The server answers it with HTTP 404 (vercel.json, 404.html). */
export function NotFound() {
  return (
    <>
      <PageHero eyebrow="Not found" title="We could not find that page." lede="The address may be mistyped, or the page may have moved." />
      <PageBody>
        <P>If you scanned a QuR Tag and got here, check the short code printed beside the QR code and type it in again.</P>
        <div className="flex flex-col gap-3 sm:flex-row">
          <PrimaryLink to="/">Go to the home page</PrimaryLink>
          <SecondaryLink to="/help">Read the help page</SecondaryLink>
        </div>
      </PageBody>
    </>
  );
}
