import { initializeApp } from "https://www.gstatic.com/firebasejs/11.2.0/firebase-app.js";
import { getDatabase, ref, onValue, set, onDisconnect } from "https://www.gstatic.com/firebasejs/11.2.0/firebase-database.js";

const firebaseConfig = { 
    apiKey: "AIzaSyC7lbpbRN86mWeQ6Wwj1d8saGtY9IU6yTk", 
    authDomain: "prinz-08ee97cc.firebaseapp.com", 
    databaseURL: "https://prinz-08ee97cc-default-rtdb.firebaseio.com", 
    projectId: "prinz-08ee97cc", 
    storageBucket: "prinz-08ee97cc.firebasestorage.app", 
    messagingSenderId: "431949566856", 
    appId: "1:431949566856:web:47f131b012c3055c6ae03d" 
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// Use sessionStorage so the same tab keeps the same ID across page refreshes/navigation
let myId = sessionStorage.getItem('presenceId');
if (!myId) {
    myId = Math.random().toString(36).substr(2, 9);
    sessionStorage.setItem('presenceId', myId);
}

const presenceRef = ref(db, 'presence/' + myId);

// Set presence to true and remove on disconnect
set(presenceRef, true);
onDisconnect(presenceRef).remove();

// Update online count if the element exists on the page
onValue(ref(db, 'presence'), (snap) => {
    const count = snap.exists() ? Object.keys(snap.val()).length : 0;
    const counterEl = document.getElementById('online-count');
    if (counterEl) {
        counterEl.innerText = `${count} Online`;
    }
});
