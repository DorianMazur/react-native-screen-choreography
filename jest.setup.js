/* global jest */
// Test renderers have no native transition host to report attachment.
jest.mock('./src/native/attachmentCapability', () => ({
  hostsReportAttachment: false,
}));
