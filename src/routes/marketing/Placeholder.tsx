import { Container } from '@/components/ui/Container';
import { Display, Lede, Eyebrow } from '@/components/brand/Typography';

interface PlaceholderProps {
  eyebrow: string;
  title: string;
  body: string;
}

export function Placeholder({ eyebrow, title, body }: PlaceholderProps) {
  return (
    <Container size="md">
      <div className="py-qurtag-16 flex flex-col gap-qurtag-3">
        <Eyebrow>{eyebrow}</Eyebrow>
        <Display level={2}>{title}</Display>
        <Lede className="max-w-2xl">{body}</Lede>
      </div>
    </Container>
  );
}
