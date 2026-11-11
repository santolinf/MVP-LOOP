/**
 * UK towns and cities offered by the place picker (handover 06, section 1). Each entry is "Name, Area" so duplicate names
 * (e.g. Newport in Wales and on the Isle of Wight) stay distinct; the saved value is that full display name.
 * A deliberately modest list: contractors can still add a place that is not listed, and existing saved values are kept.
 */
export const UK_PLACES: readonly string[] = [
  "Aberdeen, Scotland", "Aberystwyth, Wales", "Basingstoke, Hampshire", "Bath, Somerset", "Belfast, Northern Ireland", "Birmingham, West Midlands",
  "Blackburn, Lancashire", "Blackpool, Lancashire", "Bolton, Greater Manchester", "Bournemouth, Dorset", "Bracknell, Berkshire", "Bradford, West Yorkshire",
  "Brighton, East Sussex", "Bristol, Bristol", "Cambridge, Cambridgeshire", "Canterbury, Kent", "Cardiff, Wales", "Carlisle, Cumbria", "Chelmsford, Essex",
  "Cheltenham, Gloucestershire", "Chester, Cheshire", "Chichester, West Sussex", "Colchester, Essex", "Coventry, West Midlands", "Crawley, West Sussex",
  "Croydon, London", "Darlington, County Durham", "Derby, Derbyshire", "Doncaster, South Yorkshire", "Dundee, Scotland", "Durham, County Durham",
  "Edinburgh, Scotland", "Exeter, Devon", "Falkirk, Scotland", "Farnborough, Hampshire", "Glasgow, Scotland", "Gloucester, Gloucestershire",
  "Guildford, Surrey", "Harrogate, North Yorkshire", "Hull, East Yorkshire", "Inverness, Scotland", "Ipswich, Suffolk", "Kingston upon Thames, London",
  "Lancaster, Lancashire", "Leeds, West Yorkshire", "Leicester, Leicestershire", "Lincoln, Lincolnshire", "Liverpool, Merseyside", "Livingston, Scotland",
  "Londonderry, Northern Ireland", "Luton, Bedfordshire", "Maidstone, Kent", "Manchester, Greater Manchester", "Middlesbrough, North Yorkshire",
  "Milton Keynes, Buckinghamshire", "Newcastle upon Tyne, Tyne and Wear", "Newport, Wales", "Northampton, Northamptonshire", "Norwich, Norfolk",
  "Nottingham, Nottinghamshire", "Oxford, Oxfordshire", "Paisley, Scotland", "Perth, Scotland", "Peterborough, Cambridgeshire", "Plymouth, Devon",
  "Portsmouth, Hampshire", "Preston, Lancashire", "Reading, Berkshire", "Reigate, Surrey", "Salford, Greater Manchester", "Salisbury, Wiltshire",
  "Sheffield, South Yorkshire", "Slough, Berkshire", "Southampton, Hampshire", "Stevenage, Hertfordshire", "Stirling, Scotland", "Stockport, Greater Manchester",
  "Stoke-on-Trent, Staffordshire", "Sunderland, Tyne and Wear", "Swansea, Wales", "Swindon, Wiltshire", "Telford, Shropshire", "Warrington, Cheshire",
  "Watford, Hertfordshire", "Winchester, Hampshire", "Wolverhampton, West Midlands", "Worcester, Worcestershire", "Woking, Surrey", "York, North Yorkshire",
];

/** Matches the typed text against the start of the place name or of any word in it, case-insensitively. */
export function searchPlaces(query: string, chosen: readonly string[], limit = 8): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const taken = new Set(chosen.map((c) => c.toLowerCase()));
  return UK_PLACES.filter((p) => {
    const lower = p.toLowerCase();
    return !taken.has(lower) && lower.split(/[\s,]+/).some((w) => w.startsWith(q));
  }).slice(0, limit);
}
