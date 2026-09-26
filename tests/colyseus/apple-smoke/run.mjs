import { mkdtemp, mkdir, rm, writeFile, copyFile, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { buildSmokeExecutable, capture, run } from '../native-smoke-utils.mjs';

const readArg = (name) => {
  const index = process.argv.indexOf(name);
  return index < 0 ? '' : process.argv[index + 1] ?? '';
};
const platform = readArg('--platform');
const target = readArg('--target');
const applePlatforms = {
  ios: { xcodeName: 'iOS', runtime: /\.iOS-/i, device: /iPhone/i, supported: 'iPhoneSimulator', family: 1, minimum: '16.0' },
  tvos: { xcodeName: 'tvOS', runtime: /\.tvOS-/i, device: /Apple TV/i, supported: 'AppleTVSimulator', family: 3, minimum: '16.0' },
  visionos: { xcodeName: 'visionOS', runtime: /\.(?:visionOS|xrOS)-/i, device: /Apple Vision Pro/i, supported: 'XRSimulator', family: 7, minimum: '1.0' },
  watchos: { xcodeName: 'watchOS', runtime: /\.watchOS-/i, device: /Apple Watch/i, supported: 'WatchSimulator', family: 4, minimum: '9.0' },
};
const config = applePlatforms[platform];
if (!config || !target || !target.endsWith('-sim')) {
  throw new Error(`Expected --platform ios|tvos|visionos|watchos and a simulator --target; got ${platform} ${target}`);
}

function listDevices() {
  return JSON.parse(capture('xcrun', ['simctl', 'list', 'devices', 'available', '--json']));
}

let devices = listDevices();
let matching = Object.entries(devices.devices ?? {})
  .filter(([runtime]) => config.runtime.test(runtime))
  .flatMap(([runtime, entries]) => entries
    .filter((device) => device.isAvailable !== false && config.device.test(device.name))
    .map((device) => ({ ...device, runtime })));

if (matching.length === 0) {
  throw new Error(`No available ${config.xcodeName} simulator device/runtime is installed on this runner`);
}

const device = matching[0];
const originallyBooted = device.state === 'Booted';
const tempRoot = await mkdtemp(join(tmpdir(), 'bornengine-colyseus-'));
const appName = 'ColyseusSmoke.app';
const appPath = join(tempRoot, appName);
const executable = buildSmokeExecutable(target, { nightly: platform === 'watchos' });
const executableName = basename(executable);
const executablePath = join(appPath, executableName);
const bundleId = `io.bornengine.colyseus.smoke.${platform}`;

function escapeXml(value) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

try {
  await mkdir(appPath, { recursive: true });
  await copyFile(executable, executablePath);
  await chmod(executablePath, 0o755);
  const watchKitEntry = platform === 'watchos'
    ? '<key>WKWatchKitApp</key><true/>'
    : '';
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleDevelopmentRegion</key><string>en</string>
<key>CFBundleExecutable</key><string>${escapeXml(executableName)}</string>
<key>CFBundleIdentifier</key><string>${bundleId}</string>
<key>CFBundleInfoDictionaryVersion</key><string>6.0</string>
<key>CFBundleName</key><string>ColyseusSmoke</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>1.0</string>
<key>CFBundleVersion</key><string>1</string>
<key>CFBundleSupportedPlatforms</key><array><string>${config.supported}</string></array>
<key>MinimumOSVersion</key><string>${config.minimum}</string>
<key>UIDeviceFamily</key><array><integer>${config.family}</integer></array>
${watchKitEntry}
</dict></plist>`;
  await writeFile(join(appPath, 'Info.plist'), plist);
  run('codesign', ['--force', '--deep', '--sign', '-', appPath]);

  if (!originallyBooted) run('xcrun', ['simctl', 'boot', device.udid]);
  run('xcrun', ['simctl', 'bootstatus', device.udid, '-b']);
  run('xcrun', ['simctl', 'install', device.udid, appPath]);
  const output = capture('xcrun', [
    'simctl', 'launch', '--console', '--terminate-running-process',
    device.udid, bundleId, '--nocapture',
  ]);
  process.stdout.write(output);
  if (!output.includes('COLYSEUS_NATIVE_SMOKE_OK')) {
    throw new Error(`${platform} simulator app exited without the Colyseus smoke success marker`);
  }
} finally {
  if (!originallyBooted) {
    try { run('xcrun', ['simctl', 'shutdown', device.udid], { stdio: 'pipe' }); } catch { /* Preserve the smoke failure. */ }
  }
  await rm(tempRoot, { recursive: true, force: true });
}
