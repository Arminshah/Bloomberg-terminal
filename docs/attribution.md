# Attribution

What each provider asks for when its data is shown, and where the app shows it. The terms behind each line, with quotes and dates, are in [data-providers.md](data-providers.md); the credit lines themselves are in `src/components/Credits.tsx`.

| Provider | What it asks for | Where the app shows it |
| --- | --- | --- |
| FRED (St. Louis Fed) | The notice "This product uses the FRED® API but is not endorsed or certified by the Federal Reserve Bank of St. Louis.", placed prominently; cite the original source and FRED; copyrighted series for personal use only | The notice and a link to FRED's terms under `MACRO`, `RELEASES` and `ECONSTATS`; every macro series names the agency behind it; the two ICE BofA series are marked personal use only |
| Office for National Statistics | "Source: Office for National Statistics licensed under the Open Government Licence v.3.0" | Credit line on `ECONSTATS` |
| Eurostat | The source acknowledged; changes to the data stated | Credit line on `ECONSTATS`; estimate and provisional flags kept as published |
| Statistics Canada | "Source: Statistics Canada, name of product, reference date. Reproduced and distributed on an "as is" basis with the permission of Statistics Canada." For worked-out figures: "Adapted from Statistics Canada, ..." and "This does not constitute an endorsement by Statistics Canada of this product." | Both notices on `ECONSTATS`, the inflation rate marked as adapted |
| Australian Bureau of Statistics | CC BY 4.0 attribution | Credit line on `ECONSTATS` |
| European Central Bank, Deutsche Bundesbank | The ESCB reuse policy: the source quoted, for example "Source: ECB statistics.", and the statistics not modified | Credit lines on `CENTRALBANKS`, `BONDS` and `CURVE` |
| Bank of England | Database reproduction under the Open Government Licence | Open Government Licence statement on `CENTRALBANKS`, `BONDS` and `CURVE` |
| Bank of Canada | Name the Bank as the source and say if changes were made | Credit lines on `CENTRALBANKS`, `BONDS` and `CURVE` |
| Reserve Bank of Australia | CC BY 4.0 with the RBA attributed | Credit lines on `CENTRALBANKS`, `BONDS` and `CURVE` |
| Federal Reserve Board | Cite the Board as the source | Credit lines on `CENTRALBANKS` and `RATEPROBS` |
| New York Fed, US Treasury, Ministry of Finance Japan, Swiss National Bank, Banco Central do Brasil | Terms not fully reviewed (see data-providers.md); named as the source | Credit lines on the rates screens; `RatesSource` names the publisher in each screen's header |
| Official announcements (Fed Board, ECB, Bank of England, Bank of Canada, RBA, BEA, ESMA) | The source acknowledged | Every headline names its publisher and links to the original |
| SEC EDGAR | Public filings, free to reuse | `FILINGS` names EDGAR and links every filing to sec.gov |
| CoinGecko | "Powered by CoinGecko" wherever its data appears | Beside the market values on `CRYPTO` and `PROFILE` |
| Kraken | Its pricing data for your own benefit only | Every crypto price is labelled Kraken's, one exchange's market |
| Yahoo Finance | No redistribution; informational use | Quote strips and company screens name it as "Yahoo Finance", with "for personal use" on hover; `PROVIDERS` says what it serves and the terms |
| Massive, Alpha Vantage, Tiingo, Twelve Data | Personal, non-commercial or internal use; no display to others | Named per column on `CROSSCHECK` |
| Financial Modeling Prep | Terms not quoted: its pages refuse automated reading | `ANALYSTS` and `EARNINGS` name FMP on every figure, with the publishers FMP gathers targets from |
| Finnhub, Marketaux, MarketWatch | Personal use; headlines and snippets with links | Every story names its publisher and the feeds that carried it, and links to the original; Marketaux's sentiment is labelled as Marketaux's |
| Alpaca | Personal, non-commercial use | Labelled "IEX (Alpaca)" and IEX ONLY on `QUOTE` |

Nothing the app shows may be passed on: screenshots and exports are for your own use, as the providers' terms say.
