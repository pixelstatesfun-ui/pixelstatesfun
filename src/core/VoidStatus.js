let statusProvider = null;

export function setVoidStatusProvider(provider) {
  statusProvider = provider;
}

export function getVoidStatusMessage() {
  if (!statusProvider) {
    return 'The next Void has not been scheduled yet.';
  }
  return statusProvider();
}
