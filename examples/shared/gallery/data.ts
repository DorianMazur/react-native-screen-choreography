export interface Photo {
  id: string;
  title: string;
  location: string;
  glyph: string;
  gradientFrom: string;
  gradientTo: string;
  description: string;
  iso: string;
  shutter: string;
  aperture: string;
}

export const PHOTOS: Photo[] = [
  {
    id: 'aurora',
    title: 'Aurora',
    location: 'Tromsø, Norway',
    glyph: '✦',
    gradientFrom: '#0F2B5B',
    gradientTo: '#3DDC97',
    description:
      'Long exposure across a still fjord. The sky burned green for nearly an hour while the mountains stayed pitch black behind it.',
    iso: 'ISO 1600',
    shutter: '8s',
    aperture: 'f/2.8',
  },
  {
    id: 'dunes',
    title: 'Dunes',
    location: 'Erg Chebbi, Morocco',
    glyph: '◐',
    gradientFrom: '#FF8FB1',
    gradientTo: '#FFB347',
    description:
      'Two hours before sunset. The wind reshapes the ridgelines all afternoon and the tonal range collapses into one long warm gradient.',
    iso: 'ISO 100',
    shutter: '1/250s',
    aperture: 'f/8',
  },
  {
    id: 'coast',
    title: 'Coast',
    location: 'Big Sur, California',
    glyph: '≋',
    gradientFrom: '#0B3D5C',
    gradientTo: '#7C5CFF',
    description:
      'Half a second exposure with an ND filter. Mist on the headland, all pacific blues, blacks, and one stripe of cold lavender on the water.',
    iso: 'ISO 64',
    shutter: '0.5s',
    aperture: 'f/11',
  },
  {
    id: 'midnight',
    title: 'Midnight',
    location: 'Reykjavík, Iceland',
    glyph: '◯',
    gradientFrom: '#1B1B3A',
    gradientTo: '#FF5470',
    description:
      'Last light against the harbor. Sodium lamps replaced the warm tones in the foreground and the sky kept all the cool ones for itself.',
    iso: 'ISO 800',
    shutter: '1/30s',
    aperture: 'f/4',
  },
  {
    id: 'forest',
    title: 'Forest',
    location: 'Olympic NP, USA',
    glyph: '∆',
    gradientFrom: '#0F3B2E',
    gradientTo: '#9CE39F',
    description:
      'Heavy fog reduced the scene to layers of green and grey. Aiming for the canopy where the moss had its strongest reflective bounce.',
    iso: 'ISO 400',
    shutter: '1/60s',
    aperture: 'f/5.6',
  },
  {
    id: 'rooftops',
    title: 'Rooftops',
    location: 'Tokyo, Japan',
    glyph: '◧',
    gradientFrom: '#22122E',
    gradientTo: '#FF8FB1',
    description:
      'Shibuya from above at 5pm. The pinks were not added in post — atmospheric haze plus crossing reflections off glass towers across the bay.',
    iso: 'ISO 200',
    shutter: '1/125s',
    aperture: 'f/4',
  },
];
