import { NCR, Place, PlacesFile } from './places';

/** "City of Cebu" -> "Cebu City" (how people say it). */
export function shortName(name: string): string {
  const m = /^City of (.+)$/.exec(name);
  return m ? `${m[1]} City` : name;
}

/** "Cebu City, Cebu" / "Quezon City, Metro Manila". */
export function placeName(place: Place, places: PlacesFile, opts: { short?: boolean } = {}): string {
  const name = shortName(place.name);
  if (opts.short) return name;
  const where = place.region === NCR ? 'Metro Manila' : places.names[place.province ?? ''] ?? places.names[place.region];
  return where ? `${name}, ${where}` : name;
}
