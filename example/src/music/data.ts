export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: string;
  glyph: string;
  gradientFrom: string;
  gradientTo: string;
  accent: string;
  bpm: number;
  releaseYear: number;
}

export const TRACKS: Track[] = [
  {
    id: 'gravity',
    title: 'Gravity Well',
    artist: 'NAVA',
    album: 'Empty Maps',
    duration: '4:12',
    glyph: '◉',
    gradientFrom: '#1B1B3A',
    gradientTo: '#7C5CFF',
    accent: '#7C5CFF',
    bpm: 92,
    releaseYear: 2024,
  },
  {
    id: 'lowtide',
    title: 'Low Tide',
    artist: 'Marisol Vega',
    album: 'Coast Sessions',
    duration: '3:47',
    glyph: '≈',
    gradientFrom: '#0B3D5C',
    gradientTo: '#3DDC97',
    accent: '#3DDC97',
    bpm: 78,
    releaseYear: 2025,
  },
  {
    id: 'neon',
    title: 'Neon Garden',
    artist: 'Yume',
    album: 'After Hours',
    duration: '5:03',
    glyph: '✦',
    gradientFrom: '#22122E',
    gradientTo: '#FF8FB1',
    accent: '#FF8FB1',
    bpm: 110,
    releaseYear: 2024,
  },
  {
    id: 'plates',
    title: 'Tectonic',
    artist: 'Rama Asri',
    album: 'Plates',
    duration: '6:21',
    glyph: '∇',
    gradientFrom: '#1A0F00',
    gradientTo: '#FFB347',
    accent: '#FFB347',
    bpm: 85,
    releaseYear: 2023,
  },
  {
    id: 'spire',
    title: 'Spire',
    artist: 'Caelum',
    album: 'North',
    duration: '4:55',
    glyph: '△',
    gradientFrom: '#0F2B2B',
    gradientTo: '#9CE39F',
    accent: '#9CE39F',
    bpm: 96,
    releaseYear: 2025,
  },
  {
    id: 'midnight',
    title: 'Midnight Air',
    artist: 'Lyra Faye',
    album: 'Long Exposure',
    duration: '3:28',
    glyph: '○',
    gradientFrom: '#1B1B3A',
    gradientTo: '#FF5470',
    accent: '#FF5470',
    bpm: 70,
    releaseYear: 2024,
  },
];
