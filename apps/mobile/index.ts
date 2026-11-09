import { AppRegistry } from 'react-native';

// Loaded here, not only from the root layout, so a paired bangle reconnects when Android starts the
// app headless (the background service restarted after the process was killed).
import './src/features/device/bangle';
import 'expo-router/entry';

// Held open by the Android background service (BangleLinkService.TASK_KEY): React Native keeps JS
// timers running in the background only while a headless task is active. Never resolves.
AppRegistry.registerHeadlessTask('LinkdBackgroundLink', () => () => new Promise<void>(() => {}));
