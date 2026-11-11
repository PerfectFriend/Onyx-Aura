export function calculateDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  return Number(distance.toFixed(2));
}

export function formatTravelEstimate(distanceKm: number): {
  walkMinutes: number;
  driveMinutes: number;
  label: string;
} {
  const walkMinutes = Math.max(2, Math.round(distanceKm * 12)); // ~5 km/h
  const driveMinutes = Math.max(3, Math.round(distanceKm * 3.5)); // ~17 km/h in city
  
  let label = `${distanceKm} km`;
  if (distanceKm < 1.5) {
    label = `${distanceKm} km · 🚶 ${walkMinutes} min walk`;
  } else {
    label = `${distanceKm} km · 🚗 ${driveMinutes} min drive`;
  }

  return {
    walkMinutes,
    driveMinutes,
    label,
  };
}
