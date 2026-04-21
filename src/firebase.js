import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set, push, remove, update, onValue, off } from 'firebase/database';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';

const firebaseConfig = {
  apiKey: "AIzaSyCol5bgnbQ3_RSnGfS_cYF8JJhitOLMrSE",
  authDomain: "hanqyzy-567aa.firebaseapp.com",
  databaseURL: "https://hanqyzy-567aa-default-rtdb.firebaseio.com",
  projectId: "hanqyzy-567aa",
  storageBucket: "hanqyzy-567aa.firebasestorage.app",
  messagingSenderId: "956732945807",
  appId: "1:956732945807:web:006949551e9aa7931b47fa"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const storage = getStorage(app);

export { db, ref, set, push, remove, update, onValue, off, storage, storageRef, uploadBytes, getDownloadURL };
