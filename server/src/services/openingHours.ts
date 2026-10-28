import opening_hours from 'opening_hours';

export interface OpenNowResult {
  status: 'open' | 'closed' | 'unknown';
  openUntil?: string;
  comment?: string;
}

/**
 * Evaluates OSM opening_hours string in Asia/Kolkata timezone
 * Never throws — malformed or missing specs gracefully return status 'unknown' (Rule R5)
 */
export function evaluateOpenNow(
  openingHoursStr: string | null | undefined,
  nowDate: Date = new Date()
): OpenNowResult {
  if (!openingHoursStr || typeof openingHoursStr !== 'string' || openingHoursStr.trim() === '') {
    return { status: 'unknown', comment: 'hours unknown' };
  }

  const trimmed = openingHoursStr.trim();

  // Handle common shorthand cases
  if (trimmed === '24/7' || trimmed === '24/7 open') {
    return { status: 'open', openUntil: 'Open 24/7' };
  }

  try {
    // OpenStreetMap opening_hours library
    // Nominatim / Geoapify coordinates for Bengaluru: lat ~12.97, lon ~77.59
    const oh = new opening_hours(trimmed, {
      lat: 12.9716,
      lon: 77.5946,
      address: {
        country_code: 'in',
        state: 'Karnataka',
      },
    });

    const isOpen = oh.getState(nowDate);

    // Get next change
    let openUntil: string | undefined;
    try {
      const nextChange = oh.getNextChange(nowDate);
      if (nextChange) {
        // Format time in Asia/Kolkata
        openUntil = nextChange.toLocaleTimeString('en-IN', {
          timeZone: 'Asia/Kolkata',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        });
      }
    } catch {
      // ignore change calculation failure
    }

    return {
      status: isOpen ? 'open' : 'closed',
      openUntil: isOpen ? (openUntil ? `Closes at ${openUntil}` : 'Open') : (openUntil ? `Opens at ${openUntil}` : 'Closed'),
    };
  } catch (err) {
    // Parser error on malformed string -> must NEVER throw, returns 'unknown' per R5
    return { status: 'unknown', comment: 'malformed hours specification' };
  }
}
