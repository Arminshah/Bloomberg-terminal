import { FnHeader } from '../components/FnHeader';
import { QuoteStrip } from '../components/QuoteStrip';
import { NotConnected } from '../components/NotConnected';
import type { FnProps } from '../terminal/types';

/**
 * Analyst research: ratings, recommendations, price targets and consensus
 * estimates. No permitted source is connected, so the screen says so and
 * shows no figures. Yahoo's analyst data stays off: it is used here only as an
 * personal-use price source.
 */
export function ANR({ sec }: FnProps) {
  const s = sec!;
  return (
    <div>
      <FnHeader code="ANALYSTS" title="Analyst Research" sec={s} sub="Ratings, price targets and consensus estimates" />
      <QuoteStrip sec={s} />
      <NotConnected
        what="This screen would list broker ratings and price targets, the consensus rating and target, and consensus earnings and revenue estimates."
        why="Analyst research and consensus estimates are licensed datasets, and no free source in this app permits showing them. Yahoo's ratings, recommendations, price targets and estimates are switched off: Yahoo is used here only as a personal-use price source."
        needs="a provider whose terms allow showing analyst consensus and ratings to you, with its key configured in the provider status screen."
        see={[
          { label: 'Earnings history', command: `${s.id} EARNINGS` },
          { label: 'Financial statements', command: `${s.id} FINANCIALS` },
          { label: 'Provider status', command: 'PROVIDERS' },
        ]}
      />
    </div>
  );
}
