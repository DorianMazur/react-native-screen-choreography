import type { ImageSourcePropType } from 'react-native';

export interface Trip {
  id: string;
  title: string;
  dates: string;
  image: ImageSourcePropType;
  airport: string;
  activity: string;
  days: readonly {
    date: string;
    hours: string;
    distance: string;
    map: ImageSourcePropType;
  }[];
}

// Destinations and itineraries are illustrative, not photograph metadata.
export const TRIPS: readonly Trip[] = [
  {
    id: 'seiland',
    title: 'SEILAND\nNORWAY',
    dates: '3 AUG – 9 AUG',
    image: require('./assets/cabin.jpg'),
    airport: 'OSLO LUFTHAVN',
    activity: 'Hiking',
    days: [
      {
        map: require('./assets/maps/seiland-1.png'),
        date: '3 Aug.',
        hours: '8 hours',
        distance: '20 km',
      },
      {
        map: require('./assets/maps/seiland-2.png'),
        date: '4 Aug.',
        hours: '7 hours',
        distance: '16 km',
      },
      {
        map: require('./assets/maps/seiland-3.png'),
        date: '5 Aug.',
        hours: '5 hours',
        distance: '12 km',
      },
    ],
  },
  {
    id: 'mallorca',
    title: 'MALLORCA\nSPAIN',
    dates: '10 JUL – 17 JUL',
    image: require('../assets/photos/coast.jpg'),
    airport: 'LONDON HEATHROW',
    activity: 'Coastal walk',
    days: [
      {
        map: require('./assets/maps/mallorca-1.png'),
        date: '10 Jul.',
        hours: '4 hours',
        distance: '9 km',
      },
      {
        map: require('./assets/maps/mallorca-2.png'),
        date: '11 Jul.',
        hours: '3 hours',
        distance: '7 km',
      },
      {
        map: require('./assets/maps/mallorca-3.png'),
        date: '12 Jul.',
        hours: '5 hours',
        distance: '11 km',
      },
    ],
  },
];
