import { Platform } from 'react-native';

/**
 * Hosts that must report `attached` before content moves into them. iOS
 * registers a portal host before its window container is attached. Android
 * ordinarily mounts hosts and content in one transaction and gates the draw
 * natively. The provider also requests attachment preparation on Android when
 * a matched endpoint has destination companion content to initialize.
 */
export const hostsReportAttachment = Platform.OS === 'ios';
