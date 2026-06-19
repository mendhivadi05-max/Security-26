// Firebase SDK Imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";

import { getFirestore } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

// Firebase Configuration
const firebaseConfig = {

    apiKey: "AIzaSyDW2tNJCiXLEEUirjEzxHUaBQL6026KcGY",

    authDomain: "clubdeskin.firebaseapp.com",

    projectId: "clubdeskin",

    storageBucket: "clubdeskin.firebasestorage.app",

    messagingSenderId: "981726297506",

    appId: "1:981726297506:web:dd2637eefb4ee25be346fb"

};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Firestore Database
const db = getFirestore(app);

export { db };