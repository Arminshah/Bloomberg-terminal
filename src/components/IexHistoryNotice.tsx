/** The history coverage offered by the explicitly selected IEX snapshot source. */
export function IexHistoryNotice({ intraday = false }: { intraday?: boolean }) {
  return <div className="note">{intraday
    ? 'IEX only: price observations collected since this app opened. Trades between observations and their volume are unknown.'
    : 'IEX only: the snapshot supplies the previous and latest daily bars. Longer price history is unavailable in this mode.'}</div>;
}
