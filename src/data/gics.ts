/**
 * GICS industry groups (the structure in force since March 2023): each sub-industry's group, the level between a
 * sector and its industries ("Information Technology" > "Semiconductors & Semiconductor Equipment" > "Semiconductors").
 * The S&P 500 member list gives each company's sector and sub-industry; the heat map groups by sector, then industry
 * group. Energy, Materials and Utilities have one industry group each, named as the sector.
 */

const GROUPS: Record<string, string[]> = {
  // Industrials
  'Capital Goods': [
    'Aerospace & Defense', 'Building Products', 'Construction & Engineering', 'Electrical Components & Equipment', 'Heavy Electrical Equipment',
    'Industrial Conglomerates', 'Construction Machinery & Heavy Transportation Equipment', 'Agricultural & Farm Machinery',
    'Industrial Machinery & Supplies & Components', 'Trading Companies & Distributors',
  ],
  'Commercial & Professional Services': [
    'Commercial Printing', 'Environmental & Facilities Services', 'Office Services & Supplies', 'Diversified Support Services', 'Security & Alarm Services',
    'Human Resource & Employment Services', 'Research & Consulting Services', 'Data Processing & Outsourced Services',
  ],
  Transportation: [
    'Air Freight & Logistics', 'Passenger Airlines', 'Airlines', 'Marine Transportation', 'Rail Transportation', 'Cargo Ground Transportation',
    'Passenger Ground Transportation', 'Trucking', 'Airport Services', 'Highways & Railtracks', 'Marine Ports & Services',
  ],
  // Consumer Discretionary
  'Automobiles & Components': ['Automotive Parts & Equipment', 'Tires & Rubber', 'Automobile Manufacturers', 'Motorcycle Manufacturers'],
  'Consumer Durables & Apparel': [
    'Consumer Electronics', 'Home Furnishings', 'Homebuilding', 'Household Appliances', 'Housewares & Specialties', 'Leisure Products',
    'Apparel, Accessories & Luxury Goods', 'Footwear', 'Textiles',
  ],
  'Consumer Services': ['Casinos & Gaming', 'Hotels, Resorts & Cruise Lines', 'Leisure Facilities', 'Restaurants', 'Education Services', 'Specialized Consumer Services'],
  'Consumer Discretionary Distribution & Retail': [
    'Distributors', 'Broadline Retail', 'Internet & Direct Marketing Retail', 'General Merchandise Stores', 'Apparel Retail', 'Computer & Electronics Retail',
    'Home Improvement Retail', 'Other Specialty Retail', 'Specialty Stores', 'Automotive Retail', 'Homefurnishing Retail',
  ],
  // Consumer Staples
  'Consumer Staples Distribution & Retail': ['Drug Retail', 'Food Distributors', 'Food Retail', 'Consumer Staples Merchandise Retail', 'Hypermarkets & Super Centers'],
  'Food, Beverage & Tobacco': ['Brewers', 'Distillers & Vintners', 'Soft Drinks & Non-alcoholic Beverages', 'Soft Drinks', 'Agricultural Products & Services', 'Agricultural Products', 'Packaged Foods & Meats', 'Tobacco'],
  'Household & Personal Products': ['Household Products', 'Personal Care Products', 'Personal Products'],
  // Health Care
  'Health Care Equipment & Services': [
    'Health Care Equipment', 'Health Care Supplies', 'Health Care Distributors', 'Health Care Services', 'Health Care Facilities', 'Managed Health Care',
    'Health Care Technology',
  ],
  'Pharmaceuticals, Biotechnology & Life Sciences': ['Biotechnology', 'Pharmaceuticals', 'Life Sciences Tools & Services'],
  // Financials
  Banks: ['Diversified Banks', 'Regional Banks', 'Thrifts & Mortgage Finance'],
  'Financial Services': [
    'Diversified Financial Services', 'Multi-Sector Holdings', 'Specialized Finance', 'Commercial & Residential Mortgage Finance',
    'Transaction & Payment Processing Services', 'Consumer Finance', 'Asset Management & Custody Banks', 'Investment Banking & Brokerage',
    'Diversified Capital Markets', 'Financial Exchanges & Data', 'Mortgage REITs',
  ],
  Insurance: ['Insurance Brokers', 'Life & Health Insurance', 'Multi-line Insurance', 'Property & Casualty Insurance', 'Reinsurance'],
  // Information Technology
  'Software & Services': ['IT Consulting & Other Services', 'Internet Services & Infrastructure', 'Application Software', 'Systems Software'],
  'Technology Hardware & Equipment': [
    'Communications Equipment', 'Technology Hardware, Storage & Peripherals', 'Electronic Equipment & Instruments', 'Electronic Components',
    'Electronic Manufacturing Services', 'Technology Distributors',
  ],
  'Semiconductors & Semiconductor Equipment': ['Semiconductor Materials & Equipment', 'Semiconductor Equipment', 'Semiconductors'],
  // Communication Services
  'Telecommunication Services': ['Alternative Carriers', 'Integrated Telecommunication Services', 'Wireless Telecommunication Services'],
  'Media & Entertainment': ['Advertising', 'Broadcasting', 'Cable & Satellite', 'Publishing', 'Movies & Entertainment', 'Interactive Home Entertainment', 'Interactive Media & Services'],
  // Real Estate
  'Equity Real Estate Investment Trusts (REITs)': [
    'Diversified REITs', 'Industrial REITs', 'Hotel & Resort REITs', 'Office REITs', 'Health Care REITs', 'Multi-Family Residential REITs',
    'Single-Family Residential REITs', 'Residential REITs', 'Retail REITs', 'Other Specialized REITs', 'Self-Storage REITs', 'Telecom Tower REITs',
    'Timber REITs', 'Data Center REITs', 'Specialized REITs',
  ],
  'Real Estate Management & Development': ['Diversified Real Estate Activities', 'Real Estate Operating Companies', 'Real Estate Development', 'Real Estate Services'],
};

const BY_SUB = new Map<string, string>();
for (const [group, subs] of Object.entries(GROUPS)) for (const s of subs) BY_SUB.set(s.toLowerCase(), group);

/** Sectors with a single industry group, which carries the sector's name. */
const ONE_GROUP = new Set(['Energy', 'Materials', 'Utilities']);

/**
 * The GICS industry group of a sub-industry, given its sector. A sub-industry the table does not know (a renamed or
 * new one) is its own group, so nothing is put in a group it may not belong to.
 */
export function industryGroup(sector: string, subIndustry: string): string {
  if (ONE_GROUP.has(sector)) return sector;
  return BY_SUB.get(subIndustry.trim().toLowerCase()) ?? (subIndustry.trim() || sector || 'Other');
}
