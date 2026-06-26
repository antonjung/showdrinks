const firebaseConfig = {
  apiKey: "AIzaSyDJVkTH4AOksETUt9xz6N6HbjzyINXj_n4",
  authDomain: "showdrinks.firebaseapp.com",
  projectId: "showdrinks",
  storageBucket: "showdrinks.firebasestorage.app",
  messagingSenderId: "40908227517",
  appId: "1:40908227517:web:a12c401e52847025a608d4"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
