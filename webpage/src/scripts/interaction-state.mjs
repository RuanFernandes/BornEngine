export function nextMenuState(isOpen) {
  return !isOpen;
}

export function copyFeedback(success) {
  return success
    ? { label: 'Copied', liveMessage: 'Code copied to clipboard.' }
    : { label: 'Copy failed', liveMessage: 'Copy failed. Select the code and copy it manually.' };
}
