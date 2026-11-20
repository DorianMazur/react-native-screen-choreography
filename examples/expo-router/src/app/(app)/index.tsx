import { useRouter } from 'expo-router';
import { LandingScreen } from '@screen-choreography/example-shared/landing';
export default function Home() {
  const router = useRouter();
  return (
    <LandingScreen
      openWallet={() => router.push('/wallet-tray/actions')}
      openGallery={() => router.push('/gallery-tray/intro')}
    />
  );
}
