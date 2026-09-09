import { readFile } from 'node:fs/promises';

const input = JSON.parse(await readFile(process.argv[2], 'utf8')) as {
  devices: Record<
    string,
    { name: string; isAvailable: boolean; udid: string }[]
  >;
};
const candidates = Object.entries(input.devices ?? {})
  .filter(([runtime]) => runtime.includes('iOS'))
  .sort(([a], [b]) => b.localeCompare(a, undefined, { numeric: true }))
  .flatMap(([, devices]) => devices)
  .filter((device) => device.isAvailable && device.name.startsWith('iPhone'));
const device = candidates[0];
if (!device || !/^[0-9A-Fa-f-]{36}$/.test(device.udid)) {
  throw new Error(
    'No available iPhone simulator; install an iOS runtime in Xcode.'
  );
}
console.log(
  process.argv.includes('--id-only')
    ? device.udid
    : `PERFORMANCE_IOS_DEVICE=${device.udid}`
);
