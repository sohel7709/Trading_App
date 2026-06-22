import { Alert, Linking, Platform } from 'react-native';
import * as Camera from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import * as Notifications from 'expo-notifications';

// Permissions are requested at the moment a feature needs them (Android 6+ /
// iOS runtime model). Each helper returns true if granted, false otherwise,
// and offers to open Settings when the user has permanently denied access.

function offerSettings(label) {
  Alert.alert(
    `${label} permission needed`,
    `Zerodha Kite needs ${label.toLowerCase()} access for this feature. You can enable it in Settings.`,
    [
      { text: 'Not now', style: 'cancel' },
      { text: 'Open Settings', onPress: () => Linking.openSettings() },
    ]
  );
}

// Camera — KYC document scan / profile photo capture
export async function ensureCameraPermission() {
  const { status, canAskAgain } = await Camera.requestCameraPermissionsAsync();
  if (status === 'granted') return true;
  if (!canAskAgain) offerSettings('Camera');
  return false;
}

// Photo library / storage — pick KYC docs or profile image
export async function ensurePhotosPermission() {
  const { status, canAskAgain } =
    await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status === 'granted') return true;
  if (!canAskAgain) offerSettings('Photos');
  return false;
}

// Media library — save downloaded statements/reports to device
export async function ensureMediaLibraryPermission() {
  const { status, canAskAgain } = await MediaLibrary.requestPermissionsAsync();
  if (status === 'granted') return true;
  if (!canAskAgain) offerSettings('Media');
  return false;
}

// Notifications — price alerts, order fills (Android 13+ requires a runtime ask)
export async function ensureNotificationPermission() {
  const { status } = await Notifications.getPermissionsAsync();
  if (status === 'granted') return true;
  const req = await Notifications.requestPermissionsAsync();
  if (req.status === 'granted') return true;
  if (!req.canAskAgain) offerSettings('Notifications');
  return false;
}

// NOTE on SMS / OTP autofill:
// Expo has no first-party SMS-reading module, and Google Play restricts
// READ_SMS to default SMS handlers. The supported, policy-safe way to
// autofill a login OTP is the platform autofill hint below — no permission,
// no Play review risk. RECEIVE_SMS is declared in app.json only for a future
// custom dev-build that uses the SMS Retriever API (also permission-free).
export const OTP_INPUT_PROPS = {
  textContentType: 'oneTimeCode', // iOS keyboard OTP suggestion
  autoComplete: Platform.OS === 'android' ? 'sms-otp' : 'one-time-code',
  keyboardType: 'number-pad',
};
