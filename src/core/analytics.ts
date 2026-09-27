import { initializeApp } from 'firebase/app';
import { getAnalytics, isSupported } from 'firebase/analytics';

const firebaseConfig = {
  apiKey: 'AIzaSyBBx_3_u-lYFY6kV4TkP8QwBmPadblaqak',
  authDomain: 'yakuza-clone-cwb.firebaseapp.com',
  projectId: 'yakuza-clone-cwb',
  storageBucket: 'yakuza-clone-cwb.firebasestorage.app',
  messagingSenderId: '778765207825',
  appId: '1:778765207825:web:11e5d9ea5d43d07f4c64b0',
  measurementId: 'G-BCB1NL0793',
};

/** Google Analytics: page_view / active users show up in the Firebase console. No-op where unsupported (e.g. no IndexedDB). */
export function initAnalytics(): void {
  if (import.meta.env.DEV) return;
  isSupported()
    .then((ok) => { if (ok) getAnalytics(initializeApp(firebaseConfig)); })
    .catch(() => {});
}
