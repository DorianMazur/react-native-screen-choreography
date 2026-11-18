const minute = (hour: number, minutes: number) => hour * 60 + minutes;

// A fixed June 21 itinerary keeps the example repeatable and available offline.
export const PLACES = [
  {
    id: 'monument-valley',
    name: 'Monument Valley',
    region: 'Colorado Plateau, USA',
    image: require('../assets/photos/dunes.jpg'),
    zone: 'MDT',
    sunrise: minute(5, 58),
    noon: minute(13, 22),
    golden: minute(20, 7),
    sunset: minute(20, 47),
  },
  {
    id: 'big-sur',
    name: 'Big Sur',
    region: 'California, USA',
    image: require('../assets/photos/coast.jpg'),
    zone: 'PDT',
    sunrise: minute(5, 48),
    noon: minute(13, 8),
    golden: minute(19, 51),
    sunset: minute(20, 28),
  },
  {
    id: 'tokyo',
    name: 'Tokyo',
    region: 'Kantō, Japan',
    image: require('../assets/photos/rooftops.jpg'),
    zone: 'JST',
    sunrise: minute(4, 25),
    noon: minute(11, 43),
    golden: minute(18, 25),
    sunset: minute(19, 1),
  },
  {
    id: 'olympic',
    name: 'Olympic Peninsula',
    region: 'Washington, USA',
    image: require('../assets/photos/forest.jpg'),
    zone: 'PDT',
    sunrise: minute(5, 15),
    noon: minute(13, 17),
    golden: minute(20, 31),
    sunset: minute(21, 19),
  },
] as const;
export type Place = (typeof PLACES)[number];

export const EVENTS = [
  { key: 'sunrise', title: 'Sunrise', icon: 'sunrise' },
  { key: 'noon', title: 'Solar noon', icon: 'sun' },
  { key: 'golden', title: 'Golden hour', icon: 'sunLow' },
  { key: 'sunset', title: 'Sunset', icon: 'sunset' },
] as const;
export type SunEvent = (typeof EVENTS)[number];

export function clockTime(minutes: number) {
  const hours = Math.floor(minutes / 60);
  return `${hours % 12 || 12}:${String(minutes % 60).padStart(2, '0')} ${hours < 12 ? 'AM' : 'PM'}`;
}

export function dayLength(place: Place) {
  const duration = place.sunset - place.sunrise;
  return `${Math.floor(duration / 60)}h ${duration % 60}m`;
}
