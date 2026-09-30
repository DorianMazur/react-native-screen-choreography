import { Platform } from 'react-native';

/**
 * Hosts that must report `attached` before content moves into them. iOS
 * registers a portal host before its window container is attached. Android
 * mounts hosts and content in one transaction and gates the draw natively, so
 * it hands content over in the commit that mounts the overlay.
 */
export const hostsReportAttachment = Platform.OS === 'ios';
